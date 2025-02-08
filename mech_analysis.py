#mech_analysis.py
import numpy as np
import kineticstoolkit as ktk
from dataclasses import dataclass
from typing import Dict, List, Optional
from time import time

@dataclass
class SegmentPair:
    proximal: str
    distal: str
    rotation_sequence: str
    joint_name: str

@dataclass
class JointAngles:
    angles: Dict[str, float]
    angular_velocity: Dict[str, float]
    angular_acceleration: Dict[str, float]
    time: float

class BiomechanicalAnalysis:
    def __init__(self):
        self.points = self._initialize_ktk_components()
        self.segment_pairs = self._define_segment_pairs()
        self.joint_data: Dict[str, List[JointAngles]] = {}
        self.time_window = 5
        self.start_time = time()
        self.frame_times = []


    @staticmethod
    def _define_segment_pairs() -> Dict[str, SegmentPair]:
        """Define pares de segmentos para análisis"""
        return {
            # Brazo derecho
            "right_elbow": SegmentPair(
                proximal="pose_12:pose_14",  # shoulder to elbow
                distal="pose_14:pose_16",  # elbow to wrist
                rotation_sequence="xyz",
                joint_name="Right Elbow"
            ),
            "right_shoulder": SegmentPair(
                proximal="pose_24:pose_12",  # hip to shoulder
                distal="pose_12:pose_14",  # shoulder to elbow
                rotation_sequence="xyz",
                joint_name="Right Shoulder"
            ),
            "right_wrist": SegmentPair(
                proximal="pose_14:pose_16",  # elbow to wrist
                distal="right_hand_0:right_hand_9",  # wrist to metacarpal
                rotation_sequence="xyz",
                joint_name="Right Wrist"
            ),
            # Pierna derecha
            "right_knee": SegmentPair(
                proximal="pose_24:pose_26",  # hip to knee
                distal="pose_26:pose_28",  # knee to ankle
                rotation_sequence="xyz",
                joint_name="Right Knee"
            ),
            "right_hip": SegmentPair(
                proximal="pose_12:pose_24",  # shoulder to hip
                distal="pose_24:pose_26",  # hip to knee
                rotation_sequence="xyz",
                joint_name="Right Hip"
            ),
            "right_ankle": SegmentPair(
                proximal="pose_26:pose_28",  # knee to ankle
                distal="pose_28:pose_32",  # ankle to foot index
                rotation_sequence="xyz",
                joint_name="Right Ankle"
            ),
            # Brazo izquierdo
            "left_elbow": SegmentPair(
                proximal="pose_11:pose_13",  # shoulder to elbow
                distal="pose_13:pose_15",  # elbow to wrist
                rotation_sequence="xyz",
                joint_name="Left Elbow"
            ),
            "left_shoulder": SegmentPair(
                proximal="pose_23:pose_11",  # hip to shoulder
                distal="pose_11:pose_13",  # shoulder to elbow
                rotation_sequence="xyz",
                joint_name="Left Shoulder"
            ),
            "left_wrist": SegmentPair(
                proximal="pose_13:pose_15",  # elbow to wrist
                distal="left_hand_0:left_hand_9",  # wrist to metacarpal
                rotation_sequence="xyz",
                joint_name="Left Wrist"
            ),
            # Pierna izquierda
            "left_knee": SegmentPair(
                proximal="pose_23:pose_25",  # hip to knee
                distal="pose_25:pose_27",  # knee to ankle
                rotation_sequence="xyz",
                joint_name="Left Knee"
            ),
            "left_hip": SegmentPair(
                proximal="pose_11:pose_23",  # shoulder to hip
                distal="pose_23:pose_25",  # hip to knee
                rotation_sequence="xyz",
                joint_name="Left Hip"
            ),
            "left_ankle": SegmentPair(
                proximal="pose_25:pose_27",  # knee to ankle
                distal="pose_27:pose_31",  # ankle to foot index
                rotation_sequence="xyz",
                joint_name="Left Ankle"
            ),
            "trunk": SegmentPair(
                proximal="pose_23:pose_24",
                distal="pose_11:pose_12",
                rotation_sequence="xyz",
                joint_name="Trunk"
            )
            }

    def _initialize_ktk_components(self) -> ktk.TimeSeries:
        """Inicializa la serie temporal para análisis biomecánico"""
        points = ktk.TimeSeries()
        points.time = np.array([], dtype=float)

        key_points = {
            "pose": range(33),
            "left_hand": range(21),
            "right_hand": range(21),
            "face": range(468)
        }

        for category, range_val in key_points.items():
            for i in range_val:
                points.data[f"{category}_{i}"] = np.zeros((0, 4))

        return points

    def update_points_from_avatar(self, landmarks_3d: dict):
        """Actualiza los puntos desde los landmarks del avatar"""
        try:
            # Generate unique timestamp
            current_time = time() - self.start_time

            # Ensure the time is unique
            while current_time in self.frame_times:
                current_time += 0.001  # Add 1ms if duplicate

            self.frame_times.append(current_time)

            # Create new frame data
            new_frame_data = {}
            for key, value in landmarks_3d.items():
                if isinstance(value, dict) and all(k in value for k in ['x', 'y', 'z']):
                    new_frame_data[key] = np.array([[
                        float(value['x']),
                        float(value['y']),
                        float(value['z']),
                        1.0
                    ]])

            # Update TimeSeries with new time point
            self.points.time = np.append(self.points.time, current_time)

            # Update data for each landmark
            for key, value in new_frame_data.items():
                if key in self.points.data:
                    if self.points.data[key].shape[0] == 0:
                        self.points.data[key] = value
                    else:
                        self.points.data[key] = np.vstack([self.points.data[key], value])
                else:
                    self.points.data[key] = value

            # Maintain time window
            if len(self.points.time) > self.time_window:
                keep_idx = -self.time_window
                self.points.time = self.points.time[keep_idx:]
                self.frame_times = self.frame_times[keep_idx:]
                for key in self.points.data:
                    if len(self.points.data[key]) > 0:
                        self.points.data[key] = self.points.data[key][keep_idx:]

            # Analyze and return current angles
            self.analyze_all_segments()
            return self.get_current_angles()

        except Exception as e:
            print(f"Error updating points: {str(e)}")
            return {}


    def _create_transform_from_points(self, start_point: np.ndarray, end_point: np.ndarray) -> np.ndarray:
        """Creates a transformation matrix from two points"""
        # Calculate primary axis (Z)
        z_axis = end_point - start_point
        z_axis = z_axis / np.linalg.norm(z_axis)

        # Calculate temporary vector for cross product
        temp = np.array([1, 0, 0]) if abs(z_axis[1]) > 0.9 else np.array([0, 1, 0])

        # Calculate Y axis
        y_axis = np.cross(z_axis, temp)
        y_axis = y_axis / np.linalg.norm(y_axis)

        # Calculate X axis
        x_axis = np.cross(y_axis, z_axis)

        # Create transformation matrix
        transform = np.eye(4)
        transform[:3, 0] = x_axis
        transform[:3, 1] = y_axis
        transform[:3, 2] = z_axis
        transform[:3, 3] = start_point

        return transform

    def _get_segment_vector(self, segment_def: str, frame_idx: int) -> np.ndarray:
        """Obtiene el vector de un segmento y lo normaliza"""
        try:
            start_point, end_point = segment_def.split(':')
            start_coords = self.points.data[start_point][frame_idx, :3]  # Changed indexing
            end_coords = self.points.data[end_point][frame_idx, :3]  # Changed indexing

            vector = end_coords - start_coords
            norm = np.linalg.norm(vector)

            if norm < 1e-10:  # Check for very small values
                return np.zeros(3)

            return vector / norm

        except Exception as e:
            print(f"Error getting segment vector for {segment_def}: {str(e)}")
            return np.zeros(3)


    def get_current_angles(self) -> dict:
        """Obtiene los ángulos actuales"""
        return {
            joint_name: {
                'angles': joint_data[-1].angles,
                'velocities': joint_data[-1].angular_velocity,
                'accelerations': joint_data[-1].angular_acceleration
            } if joint_data else {
                'angles': {'Flexion': 0.0, 'Abduction': 0.0, 'Rotation': 0.0},
                'velocities': {'Flexion': 0.0, 'Abduction': 0.0, 'Rotation': 0.0},
                'accelerations': {'Flexion': 0.0, 'Abduction': 0.0, 'Rotation': 0.0}
            }
            for joint_name, joint_data in self.joint_data.items()
        }



    def calculate_euler_angles(self, pair: SegmentPair, frame_idx: int) -> Dict[str, float]:
        """Calcula los ángulos de Euler"""
        try:
            # Get start and end points for both segments
            prox_start, prox_end = pair.proximal.split(':')
            dist_start, dist_end = pair.distal.split(':')

            # Get point coordinates
            prox_start_coords = self.points.data[prox_start][frame_idx, :3]
            prox_end_coords = self.points.data[prox_end][frame_idx, :3]
            dist_start_coords = self.points.data[dist_start][frame_idx, :3]
            dist_end_coords = self.points.data[dist_end][frame_idx, :3]

            # Create transformation matrices
            prox_transform = self._create_transform_from_points(prox_start_coords, prox_end_coords)
            dist_transform = self._create_transform_from_points(dist_start_coords, dist_end_coords)

            # Calculate relative transformation
            relative_transform = np.linalg.inv(prox_transform) @ dist_transform

            # Convert to Euler angles based on sequence
            angles = self._matrix_to_euler_angles(relative_transform, pair.rotation_sequence)

            # Assign names based on sequence
            angle_names = ['Flexion', 'Abduction', 'Rotation']
            if pair.rotation_sequence.lower() == 'yxy':
                angle_names = ['Plane', 'Elevation', 'Rotation']

            return dict(zip(angle_names, angles))

        except Exception as e:
            print(f"Error calculating angles for {pair.joint_name}: {str(e)}")
            return {name: 0.0 for name in ['Flexion', 'Abduction', 'Rotation']}

    def _matrix_to_euler_angles(self, matrix: np.ndarray, sequence: str) -> np.ndarray:
        """Convert rotation matrix to Euler angles"""
        # Simple implementation for XYZ sequence (can be expanded for other sequences)
        angles = np.zeros(3)

        if sequence.lower() == 'xyz':
            angles[1] = np.arcsin(-matrix[2, 0])
            angles[0] = np.arctan2(matrix[2, 1], matrix[2, 2])
            angles[2] = np.arctan2(matrix[1, 0], matrix[0, 0])
        elif sequence.lower() == 'yxy':
            angles[1] = np.arccos(matrix[1, 1])
            angles[0] = np.arctan2(matrix[0, 1], -matrix[2, 1])
            angles[2] = np.arctan2(matrix[1, 0], matrix[1, 2])

        # Convert to degrees
        return np.degrees(angles)

    def calculate_angular_kinematics(self, pair: SegmentPair) -> Optional[JointAngles]:
        """Calcula la cinemática angular"""
        if len(self.points.time) < 2:
            return None

        try:
            # Get subset of data for analysis
            end_idx = len(self.points.time) - 1
            start_idx = max(0, end_idx - min(self.time_window, end_idx))

            # Calculate angles for frames in window
            angles_data = []
            times = self.points.time[start_idx:end_idx + 1]

            for i in range(len(times)):
                angles = self.calculate_euler_angles(pair, start_idx + i)
                angles_data.append(angles)

            if not angles_data:
                return None

            latest_angles = angles_data[-1]

            # Calculate velocities and accelerations using time differences
            velocities = {k: 0.0 for k in latest_angles.keys()}
            accelerations = {k: 0.0 for k in latest_angles.keys()}

            if len(angles_data) > 1:
                dt = times[-1] - times[-2]
                for k in latest_angles.keys():
                    velocities[k] = (angles_data[-1][k] - angles_data[-2][k]) / dt

                    if len(angles_data) > 2:
                        prev_dt = times[-2] - times[-3]
                        prev_vel = (angles_data[-2][k] - angles_data[-3][k]) / prev_dt
                        accelerations[k] = (velocities[k] - prev_vel) / dt

            return JointAngles(
                angles=latest_angles,
                angular_velocity=velocities,
                angular_acceleration=accelerations,
                time=float(times[-1])
            )

        except Exception as e:
            print(f"Error in kinematics calculation for {pair.joint_name}: {str(e)}")
            return None

    def analyze_all_segments(self):
        """Analiza todos los segmentos"""
        for joint_name, segment_pair in self.segment_pairs.items():
            joint_kinematics = self.calculate_angular_kinematics(segment_pair)
            if joint_kinematics:
                if joint_name not in self.joint_data:
                    self.joint_data[joint_name] = []
                self.joint_data[joint_name].append(joint_kinematics)

    def save_analysis(self, output_path: str):
        """Guarda los resultados del análisis"""
        analysis_data = {
            joint_name: [
                {
                    "time": kinematics.time,
                    "angles": kinematics.angles,
                    "angular_velocity": kinematics.angular_velocity,
                    "angular_acceleration": kinematics.angular_acceleration
                }
                for kinematics in joint_data
            ]
            for joint_name, joint_data in self.joint_data.items()
        }

