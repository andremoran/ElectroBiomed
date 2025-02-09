from flask import Flask, render_template, Response, redirect, url_for, flash, request
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import cv2
import os
import numpy as np
from multicamera_holistic import MultiCameraHolisticBiomechanics
from mech_analysis import BiomechanicalAnalysis

# Create Flask application
app = Flask(__name__,
            static_url_path='',
            static_folder='static',
            template_folder='templates'
            )
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default_secret_key')
socketio = SocketIO(app, cors_allowed_origins="*")

# Flask-Login configuration
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'


class User(UserMixin):
    def __init__(self, id):
        self.id = id


# Get credentials from environment variables
VALID_USERNAME = os.environ.get('VALID_USERNAME', 'abc')
VALID_PASSWORD = os.environ.get('VALID_PASSWORD', '000')


@login_manager.user_loader
def load_user(user_id):
    return User(user_id)


class CameraManager:
    def __init__(self):
        self.cameras = {}
        self.active_cameras = set()
        self.biomech = MultiCameraHolisticBiomechanics()
        self.biomech_analysis = BiomechanicalAnalysis()
        self.all_landmarks = {}
        self.is_render = os.environ.get('RENDER') == 'true'

    def add_camera(self, camera_id):
        if camera_id in self.cameras:
            return True  # Camera already initialized

        try:
            if self.is_render:
                # For Render: Check if we can access any camera
                cap = cv2.VideoCapture(0)  # Try default camera first
                if not cap.isOpened():
                    # If default camera fails, try using a test video or image sequence
                    test_source = os.path.join(os.path.dirname(__file__), 'static', 'test_video.mp4')
                    if os.path.exists(test_source):
                        cap = cv2.VideoCapture(test_source)
                    else:
                        # Create a dummy video source
                        cap = self._create_dummy_capture()
            else:
                # Local development - use regular camera access
                cap = cv2.VideoCapture(camera_id)

            if cap.isOpened():
                # Configure camera properties
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

                # Store camera configuration
                self.cameras[camera_id] = {
                    'capture': cap,
                    'holistic': self.biomech.mp_holistic.Holistic(
                        min_detection_confidence=0.5,
                        min_tracking_confidence=0.5
                    ),
                    'is_dummy': self.is_render
                }
                self.active_cameras.add(camera_id)
                return True

        except Exception as e:
            print(f"Error initializing camera {camera_id}: {e}")
            # Create dummy capture as fallback
            if self.is_render:
                self.cameras[camera_id] = {
                    'capture': self._create_dummy_capture(),
                    'holistic': self.biomech.mp_holistic.Holistic(
                        min_detection_confidence=0.5,
                        min_tracking_confidence=0.5
                    ),
                    'is_dummy': True
                }
                self.active_cameras.add(camera_id)
                return True
        return False

    def _create_dummy_capture(self):
        """Creates a dummy video capture that generates test frames"""

        class DummyCapture:
            def __init__(self):
                self.frame_count = 0
                self.width = 640
                self.height = 480

            def read(self):
                # Create a simple test pattern
                frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
                cv2.putText(frame, f"Test Frame {self.frame_count}",
                            (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1,
                            (255, 255, 255), 2)
                self.frame_count += 1
                return True, frame

            def isOpened(self):
                return True

            def set(self, prop, value):
                if prop == cv2.CAP_PROP_FRAME_WIDTH:
                    self.width = value
                elif prop == cv2.CAP_PROP_FRAME_HEIGHT:
                    self.height = value
                return True

            def release(self):
                pass

        return DummyCapture()

    def get_frame(self, camera_id):
        if camera_id in self.cameras:
            try:
                success, frame = self.cameras[camera_id]['capture'].read()
                if success:
                    frame = cv2.flip(frame, 1)
                    processed_frame, landmarks = self.biomech.process_frame(
                        frame,
                        self.cameras[camera_id]['holistic']
                    )

                    if landmarks:
                        self.all_landmarks[camera_id] = landmarks

                        if len(self.active_cameras) > 1:
                            merged_landmarks = self.biomech.merge_landmarks(self.all_landmarks)
                            if merged_landmarks:
                                current_angles = self.biomech_analysis.update_points_from_avatar(merged_landmarks)
                                socketio.emit('data_update', {
                                    'landmarks': merged_landmarks,
                                    'angles': current_angles
                                })
                        else:
                            current_angles = self.biomech_analysis.update_points_from_avatar(landmarks)
                            socketio.emit('data_update', {
                                'landmarks': landmarks,
                                'angles': current_angles
                            })

                    return processed_frame
            except Exception as e:
                print(f"Error processing frame: {e}")
                # Return a blank frame with error message
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(frame, "Camera Error", (50, 240),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                return frame
        return None

    def release_camera(self, camera_id):
        if camera_id in self.cameras:
            try:
                self.cameras[camera_id]['capture'].release()
                self.cameras[camera_id]['holistic'].close()
                self.active_cameras.remove(camera_id)
                del self.cameras[camera_id]
                return True
            except Exception as e:
                print(f"Error releasing camera {camera_id}: {e}")
        return False

    def release_all_cameras(self):
        for camera_id in list(self.cameras.keys()):
            self.release_camera(camera_id)

# Initialize camera manager
camera_manager = CameraManager()


# Routes
@app.route('/')
def landing_page():
    return render_template('landing_page.html')


@app.route('/biomechanics2d')
def biomechanics_2d_page():
    return render_template('index2.html')


@app.route('/emg')
def emg_page():
    return render_template('emg2.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        if username == VALID_USERNAME and password == VALID_PASSWORD:
            user = User(username)
            login_user(user)
            return redirect(url_for('biomechanics_page'))
        else:
            flash('Invalid credentials')

    return render_template('login.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('landing_page'))


@app.route('/biomechanics')
@login_required
def biomechanics_page():
    return render_template('index.html')


def generate_frames(camera_id):
    while True:
        frame = camera_manager.get_frame(camera_id)
        if frame is not None:
            ret, buffer = cv2.imencode('.jpg', frame)
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')


@app.route('/video_feed/<int:camera_id>')
@login_required
def video_feed(camera_id):
    return Response(generate_frames(camera_id),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


# SocketIO events
@socketio.on('start_camera')
def handle_start_camera(data):
    camera_id = int(data.get('camera_id'))
    if camera_manager.add_camera(camera_id):
        emit('camera_started', {'camera_id': camera_id})


@socketio.on('connect')
def handle_connect():
    if not current_user.is_authenticated:
        return
    print('Client connected')


if __name__ == '__main__':
    # Get port from environment variable (Render sets this automatically)
    port = int(os.environ.get('PORT', 5000))

    # In production (Render), we don't want debug mode
    debug = os.environ.get('FLASK_ENV') == 'development'

    socketio.run(
        app,
        host='0.0.0.0',  # Required for Render
        port=port,
        debug=debug,
        allow_unsafe_werkzeug=True
    )