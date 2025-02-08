#multicamera_holistic.py
import mediapipe as mp
import cv2

class MultiCameraHolisticBiomechanics:
    def __init__(self, height=1.62, mass=69):
        self.mp_holistic = mp.solutions.holistic
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles

        self.height = height
        self.mass = mass
        self.scale_factor = height / 1.7

        self.cameras = {}
        self.active_cameras = set()
        self.reference_camera = None
        self.exclude_points = list(range(1, 11))
        self.exclude_points.extend([17, 18, 19, 20, 21, 22])

        self.custom_body_connections = [
            (11, 12), (11, 23), (12, 24), (23, 24),  # Torso
            (11, 13), (13, 15), (12, 14), (14, 16),  # Brazos
            (23, 25), (24, 26), (25, 27), (26, 28),  # Legs
            (27, 31), (28, 32), (31, 29), (32, 30),  # Feet
        ]

        self.hand_connections = self.mp_holistic.HAND_CONNECTIONS

        self.arm_hand_connections = [
            ("pose_15", "left_hand_0"),   # Left wrist to left hand
            ("pose_16", "right_hand_0"),  # Right wrist to right hand
        ]

    def process_frame(self, frame, holistic_instance):
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_rgb.flags.writeable = False
        results = holistic_instance.process(frame_rgb)
        frame_rgb.flags.writeable = True

        landmarks = self.process_landmarks(results)

        return frame, landmarks

    def get_connections(self):
        """Obtener todas las conexiones"""
        connections = [
            [f"pose_{start}", f"pose_{end}", "body"]
            for start, end in self.custom_body_connections
        ]
        connections.extend([
            [f"{side}_hand_{start}", f"{side}_hand_{end}", "hand"]
            for side in ['left', 'right']
            for start, end in self.hand_connections
        ])
        return connections

    def process_landmarks(self, results):
        if not results.pose_landmarks:
            return None

        landmarks_3d = {}

        # Calcular punto de anclaje
        left_shoulder = results.pose_landmarks.landmark[11]
        right_shoulder = results.pose_landmarks.landmark[12]
        left_hip = results.pose_landmarks.landmark[23]
        right_hip = results.pose_landmarks.landmark[24]

        anchor_point = {
            'x': (left_shoulder.x + right_shoulder.x + left_hip.x + right_hip.x) / 4,
            'y': (left_shoulder.y + right_shoulder.y + left_hip.y + right_hip.y) / 4,
            'z': (left_shoulder.z + right_shoulder.z + left_hip.z + right_hip.z) / 4
        }

        # Procesar pose
        for idx, landmark in enumerate(results.pose_landmarks.landmark):
            if idx not in self.exclude_points:
                landmarks_3d[f"pose_{idx}"] = {
                    'x': (landmark.x - anchor_point['x']) * self.scale_factor,
                    'y': -(landmark.y - anchor_point['y']) * self.scale_factor,
                    'z': (landmark.z - anchor_point['z']) * self.scale_factor
                }

        # Procesar manos
        hand_info = [
            ('left', 15, results.left_hand_landmarks),
            ('right', 16, results.right_hand_landmarks)
        ]

        for side, wrist_idx, hand_results in hand_info:
            if hand_results and f"pose_{wrist_idx}" in landmarks_3d:
                wrist_pos = landmarks_3d[f"pose_{wrist_idx}"]
                base_hand = hand_results.landmark[0]

                for idx, landmark in enumerate(hand_results.landmark):
                    # Calcular posición relativa a la base de la mano
                    rel_pos = {
                        'x': landmark.x - base_hand.x,
                        'y': landmark.y - base_hand.y,
                        'z': landmark.z - base_hand.z
                    }

                    # Aplicar offset desde la posición de la muñeca
                    landmarks_3d[f"{side}_hand_{idx}"] = {
                        'x': wrist_pos['x'] + rel_pos['x'],
                        'y': wrist_pos['y'] - rel_pos['y'],  # Invertir Y como en el cuerpo
                        'z': wrist_pos['z'] + rel_pos['z']
                    }

        # Procesar cara
        if results.face_landmarks:
            nose_pos = landmarks_3d.get('pose_0')  # Usar nariz como punto de referencia
            if nose_pos:
                face_base = results.face_landmarks.landmark[1]  # Punto de referencia facial
                for idx, landmark in enumerate(results.face_landmarks.landmark):
                    rel_pos = {
                        'x': landmark.x - face_base.x,
                        'y': landmark.y - face_base.y,
                        'z': landmark.z - face_base.z
                    }

                    landmarks_3d[f"face_{idx}"] = {
                        'x': nose_pos['x'] + rel_pos['x'],
                        'y': nose_pos['y'] - rel_pos['y'],  # Invertir Y como en el cuerpo
                        'z': nose_pos['z'] + rel_pos['z']
                    }

        landmarks_3d['connections'] = self.get_connections()
        return landmarks_3d

    def merge_landmarks(self, all_landmarks):
        if not all_landmarks:
            return None

        if len(all_landmarks) == 1:
            return list(all_landmarks.values())[0]

        merged_landmarks = {}
        camera_count = len(all_landmarks)

        # Fusionar pose primero
        for camera_id, landmarks in all_landmarks.items():
            for key, value in landmarks.items():
                if key.startswith('pose_'):
                    if key not in merged_landmarks:
                        merged_landmarks[key] = {'x': 0, 'y': 0, 'z': 0}
                    for coord in ['x', 'y', 'z']:
                        merged_landmarks[key][coord] += value[coord] / camera_count

        # Fusionar manos usando las muñecas promediadas como referencia
        for side, wrist_idx in [('left', 15), ('right', 16)]:
            wrist_key = f"pose_{wrist_idx}"
            if wrist_key in merged_landmarks:
                wrist_pos = merged_landmarks[wrist_key]
                hand_count = 0
                hand_offsets = {}

                # Recolectar todos los offsets de mano válidos
                for landmarks in all_landmarks.values():
                    hand_base_key = f"{side}_hand_0"
                    if hand_base_key in landmarks:
                        hand_count += 1
                        base_pos = landmarks[hand_base_key]

                        # Recolectar offsets para cada punto de la mano
                        for key, value in landmarks.items():
                            if key.startswith(f"{side}_hand_"):
                                if key not in hand_offsets:
                                    hand_offsets[key] = {'x': 0, 'y': 0, 'z': 0}

                                # Calcular offset relativo a la base de la mano
                                for coord in ['x', 'y', 'z']:
                                    offset = value[coord] - base_pos[coord]
                                    hand_offsets[key][coord] += offset / hand_count

                # Aplicar offsets promediados a la muñeca fusionada
                if hand_count > 0:
                    for key, offset in hand_offsets.items():
                        merged_landmarks[key] = {
                            'x': wrist_pos['x'] + offset['x'],
                            'y': wrist_pos['y'] + offset['y'],
                            'z': wrist_pos['z'] + offset['z']
                        }

        # Fusionar landmarks faciales usando la nariz promediada como referencia
        nose_key = 'pose_0'
        if nose_key in merged_landmarks:
            nose_pos = merged_landmarks[nose_key]
            face_count = 0
            face_offsets = {}

            # Recolectar todos los offsets faciales válidos
            for landmarks in all_landmarks.values():
                face_base_key = 'face_1'  # Usar el mismo punto de referencia que en process_landmarks
                if face_base_key in landmarks:
                    face_count += 1
                    base_pos = landmarks[face_base_key]

                    # Recolectar offsets para cada punto facial
                    for key, value in landmarks.items():
                        if key.startswith('face_'):
                            if key not in face_offsets:
                                face_offsets[key] = {'x': 0, 'y': 0, 'z': 0}

                            # Calcular offset relativo al punto base facial
                            for coord in ['x', 'y', 'z']:
                                offset = value[coord] - base_pos[coord]
                                face_offsets[key][coord] += offset / face_count

            # Aplicar offsets promediados a la nariz fusionada
            if face_count > 0:
                for key, offset in face_offsets.items():
                    merged_landmarks[key] = {
                        'x': nose_pos['x'] + offset['x'],
                        'y': nose_pos['y'] + offset['y'],
                        'z': nose_pos['z'] + offset['z']
                    }

        merged_landmarks['connections'] = self.get_connections()
        return merged_landmarks

    def enable_camera(self, camera_index=0):
        """Enable camera with reference tracking"""
        cap = cv2.VideoCapture(camera_index)
        if cap.isOpened():
            self.cameras[camera_index] = {
                'capture': cap,
                'holistic': self.mp_holistic.Holistic(
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                    model_complexity=2,
                    enable_segmentation=True,
                    refine_face_landmarks=True
                ),
                'landmarks_3d': {},
                'weight': 1.0  # Peso inicial
            }

            # La primera cámara será la referencia
            if self.reference_camera is None:
               self.reference_camera = camera_index
            return True
        return False