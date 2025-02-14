let previousVelocities = {};
let previousLandmarks = {}, currentLandmarks = {}, landmarksData = [];
let startTime = Date.now();
let frameCount = 0;
let isRecording = true;
let isPaused = false;
let angleChart, angularVelocityChart, angularAccelerationChart, momentosChart;
let activeEffect = 'mask';
const INERCIAS = {mano: 0.005, //0.0005
    antebrazo:  0.076,
    brazoSuperior: 0.0213
};

// Lista de articulaciones con sus colores asociados
const articulaciones = [
    { label: 'Codo izquierdo', color: 'rgb(0, 255, 0)' },
    { label: 'Hombro izquierdo', color: 'rgb(255, 0, 0)' },
    { label: 'Codo derecho', color: 'rgb(54, 162, 235)' },
    { label: 'Hombro derecho', color: 'rgb(255, 206, 86)' },
    { label: 'Muñeca izquierda', color: 'rgb(255, 0, 255)' },
    { label: 'Muñeca derecha', color: 'rgb(255, 75, 8)' },
    { label: 'Cadera izquierda', color: 'rgb(255, 159, 64)' },
    { label: 'Rodilla izquierda', color: 'rgb(153, 102, 255)' },
    { label: 'Tobillo izquierdo', color: 'rgb(255, 99, 132)' },
    { label: 'Cadera derecha', color: 'rgb(75, 192, 192)' },
    { label: 'Rodilla derecha', color: 'rgb(54, 162, 235)' },
    { label: 'Tobillo derecho', color: 'rgb(255, 205, 86)' }
];

const datasetsFactory = (tipo = '') => articulaciones.map(art => ({
    label: tipo ? `${tipo} ${art.label}` : art.label,
    data: [],
    borderColor: art.color,
    tension: 0.1
}));

const angleData = { labels: [], datasets: datasetsFactory() };
const angularVelocityData = { labels: [], datasets: datasetsFactory() };
const angularAccelerationData = { labels: [], datasets: datasetsFactory() };
const momentosData = { labels: [], datasets: datasetsFactory('Momento') };

const FRAMES_TO_UPDATE = 1;
const controls = window;
const mpHolistic = window;
const drawingUtils = window;

const config = { locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@${mpHolistic.VERSION}/${file}`;
}};

const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const controlsElement = document.getElementsByClassName('control-panel')[0];
const canvasCtx = canvasElement.getContext('2d');

const fpsControl = new controls.FPS();
const spinner = document.querySelector('.loading');
spinner.ontransitionend = () => {
    spinner.style.display = 'none';
};

function removeElements(landmarks, elements) {
    for (const element of elements) {
        delete landmarks[element];
    }
}

function removeLandmarks(results) {
    if (results.poseLandmarks) {
        removeElements(results.poseLandmarks, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15,16, 17, 18, 19, 20, 21, 22]); //15,16
    }
}

function connect(ctx, connectors) {
    const canvas = ctx.canvas;
    for (const connector of connectors) {
        const from = connector[0];
        const to = connector[1];
        if (from && to) {
            if (from.visibility && to.visibility && (from.visibility < 0.1 || to.visibility < 0.1)) {
                continue;
            }
            ctx.beginPath();
            ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
            ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
            ctx.stroke();
        }
    }
}

                // Función para dibujar un triángulo y el ángulo
function drawAngleTriangle(joint, segment1, segment2, angle, color) {
    if (joint && segment1 && segment2) {
                        canvasCtx.beginPath();
                        canvasCtx.moveTo(joint.x * canvasElement.width, joint.y * canvasElement.height);
                        canvasCtx.lineTo(segment1.x * canvasElement.width, segment1.y * canvasElement.height);
                        canvasCtx.lineTo(segment2.x * canvasElement.width, segment2.y * canvasElement.height);
                        canvasCtx.closePath();
                        canvasCtx.fillStyle = color;
                        canvasCtx.fill();

                        // Dibuja el ángulo en el centro del triángulo
                        const centerX = (joint.x + segment1.x + segment2.x) / 3 * canvasElement.width;
                        const centerY = (joint.y + segment1.y + segment2.y) / 3 * canvasElement.height;
                        canvasCtx.fillStyle = 'white';
                        canvasCtx.font = '12px Arial';
                        canvasCtx.textAlign = 'center';
                        canvasCtx.fillText(angle.toFixed(1) + '°', centerX, centerY);
    }
}

function onResults(results) {
    document.body.classList.add('loaded');
    removeLandmarks(results);

    fpsControl.tick();
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results.segmentationMask) {
        canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);

        if (activeEffect === 'mask' || activeEffect === 'both') {
            canvasCtx.globalCompositeOperation = 'source-out' & 'source-in';
            canvasCtx.fillStyle = 'black';
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

            const latestData = landmarksData[landmarksData.length - 1];

            if (latestData && results.poseLandmarks) {


                // Dibuja triángulos para el brazo izquierdo
                if (jointVisibility.shoulderLeft) {
                    const leftHip = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_HIP];
                    const leftShoulder = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_SHOULDER];
                    const leftElbow = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ELBOW];

                    // Calcular el ángulo directamente si no está disponible en latestData
                    const shoulderAngle = latestData && !isNaN(parseFloat(latestData.angleShoulderLeft))
                        ? 180 - parseFloat(latestData.angleShoulderLeft)
                        : calculateAngle(leftHip, leftShoulder, leftElbow);

                    drawAngleTriangle(leftShoulder, leftHip, leftElbow, shoulderAngle, 'rgba(255, 255, 0, 0.5)');
                }

                if (jointVisibility.elbowLeft && results.leftHandLandmarks) {
                    const leftShoulder = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_SHOULDER];
                    const leftElbow = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ELBOW];
                    const leftWrist = results.leftHandLandmarks[0];

                    // Calcular el ángulo directamente si no está disponible en latestData
                    const elbowAngle = latestData && !isNaN(parseFloat(latestData.angleElbowLeft))
                        ? parseFloat(latestData.angleElbowLeft)
                        : calculateAngle(leftShoulder, leftElbow, leftWrist);

                    drawAngleTriangle(leftElbow, leftShoulder, leftWrist, elbowAngle, 'rgba(0, 0, 255, 0.5)');
                }

                if (jointVisibility.wristLeft && results.leftHandLandmarks) {
                    const elbowLeft = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ELBOW];
                    const wristLeft = results.leftHandLandmarks[0];
                    const metacarpalLeft = results.leftHandLandmarks[9];

                    const wristAngle = latestData && !isNaN(parseFloat(latestData.angleWristLeft))
                        ? parseFloat(latestData.angleWristLeft)
                        : calculateAngle(elbowLeft, wristLeft, metacarpalLeft);

                    drawAngleTriangle(wristLeft, elbowLeft, metacarpalLeft, wristAngle, 'rgba(255, 75, 8, 0.5)');
                }

                // Dibuja triángulos para el brazo derecho
                if (jointVisibility.shoulderRight) {
                    const rightHip = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_HIP];
                    const rightShoulder = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_SHOULDER];
                    const rightElbow = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_ELBOW];

                    const shoulderAngle = latestData && !isNaN(parseFloat(latestData.angleShoulderRight))
                        ? 180 - parseFloat(latestData.angleShoulderRight)
                        : calculateAngle(rightHip, rightShoulder, rightElbow);

                    drawAngleTriangle(rightShoulder, rightHip, rightElbow, shoulderAngle, 'rgba(255, 0, 0, 0.5)');
                }

                if (jointVisibility.elbowRight && results.rightHandLandmarks) {
                    const rightShoulder = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_SHOULDER];
                    const rightElbow = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_ELBOW];
                    const rightWrist = results.rightHandLandmarks[0];

                    const elbowAngle = latestData && !isNaN(parseFloat(latestData.angleElbowRight))
                        ? parseFloat(latestData.angleElbowRight)
                        : calculateAngle(rightShoulder, rightElbow, rightWrist);

                    drawAngleTriangle(rightElbow, rightShoulder, rightWrist, elbowAngle, 'rgba(0, 255, 0, 0.5)');
                }

                if (jointVisibility.wristRight && results.rightHandLandmarks) {
                    const elbowRight = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_ELBOW];
                    const wristRight = results.rightHandLandmarks[0];
                    const metacarpalRight = results.rightHandLandmarks[9];

                    const wristAngle = latestData && !isNaN(parseFloat(latestData.angleWristRight))
                        ? parseFloat(latestData.angleWristRight)
                        : calculateAngle(elbowRight, wristRight, metacarpalRight);

                    drawAngleTriangle(wristRight, elbowRight, metacarpalRight, wristAngle, 'rgba(255, 0, 255, 0.5)');
                }
            }
        } else {
            canvasCtx.globalCompositeOperation = 'source-out' & 'source-in';
            canvasCtx.fillStyle = 'black';
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        }

        canvasCtx.globalCompositeOperation = 'destination-atop';
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.globalCompositeOperation = 'source-over';
    } else {
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    canvasCtx.lineWidth = 5;
    if (results.poseLandmarks) {
   const currentTime = (Date.now() - startTime) / 1000;
   const { angles, angularVelocities, angularAccelerations } = calculateAnglesAndDerivatives(results, currentTime);


        if (results.rightHandLandmarks) {
            canvasCtx.strokeStyle = 'white';
            connect(canvasCtx, [[
                results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_ELBOW],
                results.rightHandLandmarks[0]
            ]]);

        const shoulderRight = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_SHOULDER];
        const elbowRight = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_ELBOW];
        const wristRight = results.rightHandLandmarks[0];

        angles[0] = calculateAngle(shoulderRight, elbowRight, wristRight);
        angles[1] = calculateAngle(
            {x: shoulderRight.x, y: shoulderRight.y - 0.1},
            shoulderRight,
            elbowRight
        );
        }

        if (results.leftHandLandmarks) {
            canvasCtx.strokeStyle = 'white';
            connect(canvasCtx, [[
                results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ELBOW],
                results.leftHandLandmarks[0]
            ]]);

        const shoulderLeft = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_SHOULDER];
        const elbowLeft = results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ELBOW];
        const wristLeft = results.leftHandLandmarks[0];

        angles[2] = calculateAngle(shoulderLeft, elbowLeft, wristLeft);
        angles[3] = calculateAngle(
            {x: shoulderLeft.x, y: shoulderLeft.y - 0.1},
            shoulderLeft,
            elbowLeft
        );
        }
        //Para Graficas
        updateChart(currentTime, angles, angularVelocities, angularAccelerations);

    }

    // Pose...
    drawingUtils.drawConnectors(
        canvasCtx, results.poseLandmarks, mpHolistic.POSE_CONNECTIONS,
        { color: 'white' });
    drawingUtils.drawLandmarks(
        canvasCtx,
        Object.values(mpHolistic.POSE_LANDMARKS_LEFT)
            .map(index => results.poseLandmarks[index]),
        { visibilityMin: 0.65, color: 'white', fillColor: 'rgb(74, 35, 90)' });
    drawingUtils.drawLandmarks(
        canvasCtx,
        Object.values(mpHolistic.POSE_LANDMARKS_RIGHT)
            .map(index => results.poseLandmarks[index]),
        { visibilityMin: 0.65, color: 'white', fillColor: 'rgb(40, 116, 166)' });

    // Hands...
    drawingUtils.drawConnectors(
        canvasCtx, results.rightHandLandmarks, mpHolistic.HAND_CONNECTIONS,
        { color: 'white' });
    drawingUtils.drawLandmarks(canvasCtx, results.rightHandLandmarks, {
        color: 'white',
        fillColor: 'rgb(40, 116, 166)',
        lineWidth: 2,
        radius: (data) => {
            return drawingUtils.lerp(data.from.z, -0.15, .1, 10, 1);
        }
    });
    drawingUtils.drawConnectors(
        canvasCtx, results.leftHandLandmarks, mpHolistic.HAND_CONNECTIONS,
        { color: 'white' });
    drawingUtils.drawLandmarks(canvasCtx, results.leftHandLandmarks, {
        color: 'white',
        fillColor: 'rgb(74, 35, 90)',
        lineWidth: 2,
        radius: (data) => {
            return drawingUtils.lerp(data.from.z, -0.15, .1, 10, 1);
        }
    });

    // Face
    drawingUtils.drawConnectors(
        canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_TESSELATION,
        { color: '#C0C0C070', lineWidth: 1 });
    drawingUtils.drawConnectors(
        canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_RIGHT_EYE,
        { color: 'rgb(40, 116, 166)', lineWidth: 2 });
    drawingUtils.drawConnectors(
        canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_RIGHT_EYEBROW,
        { color: 'rgb(40, 116, 166)', lineWidth: 2 });
    drawingUtils.drawConnectors(
        canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_LEFT_EYE,
        { color: 'rgb(74, 35, 90)', lineWidth: 2 });
    drawingUtils.drawConnectors(
        canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_LEFT_EYEBROW,
        { color: 'rgb(74, 35, 90)', lineWidth: 2 });
    drawingUtils.drawConnectors(
        canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_FACE_OVAL,
        { color: '#E0E0E0', lineWidth: 5 });
    drawingUtils.drawConnectors(
        canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_LIPS,
        { color: '#E0E0E0', lineWidth: 2.5 });

    canvasCtx.restore();

    // Guardar los landmarks
    currentLandmarks = {
        pose: results.poseLandmarks,
        leftHand: results.leftHandLandmarks,
        rightHand: results.rightHandLandmarks,
        // face: results.faceLandmarks
    };

    // Calcular trayectorias, velocidades y ángulos
    if (Object.keys(previousLandmarks).length > 0) {
        calculateTrajectoriesAndVelocities();
        frameCount++;
        if (frameCount >= FRAMES_TO_UPDATE) {
            updateTable();
            frameCount = 0;
        }
    }

    if (results.poseLandmarks) {
        const currentTime = (Date.now() - startTime) / 1000;
        const { angles, angularVelocities, angularAccelerations } = calculateAnglesAndDerivatives(results, currentTime);

                        // Right leg data
        landmarksData.push({
            time: currentTime,
            part: 'rightLeg',
            angleHipRight: angles.hipRight.toFixed(2),
            angleKneeRight: angles.kneeRight.toFixed(2),
            angleAnkleRight: angles.ankleRight.toFixed(2),
            AngularVelocityHipRight: angularVelocities.hipRight ? angularVelocities.hipRight.toFixed(4) : 'N/A',
            AngularVelocityKneeRight: angularVelocities.kneeRight ? angularVelocities.kneeRight.toFixed(4) : 'N/A',
            AngularVelocityAnkleRight: angularVelocities.ankleRight ? angularVelocities.ankleRight.toFixed(4) : 'N/A',
            AngularAccelerationHipRight: angularAccelerations.hipRight ? angularAccelerations.hipRight.toFixed(4) : 'N/A',
            AngularAccelerationKneeRight: angularAccelerations.kneeRight ? angularAccelerations.kneeRight.toFixed(4) : 'N/A',
            AngularAccelerationAnkleRight: angularAccelerations.ankleRight ? angularAccelerations.ankleRight.toFixed(4) : 'N/A',
        });

                // Left leg data
        landmarksData.push({
            time: currentTime,
            part: 'leftLeg',
            angleHipLeft: angles.hipLeft.toFixed(2),
            angleKneeLeft: angles.kneeLeft.toFixed(2),
            angleAnkleLeft: angles.ankleLeft.toFixed(2),
            AngularVelocityHipLeft: angularVelocities.hipLeft ? angularVelocities.hipLeft.toFixed(4) : 'N/A',
            AngularVelocityKneeLeft: angularVelocities.kneeLeft ? angularVelocities.kneeLeft.toFixed(4) : 'N/A',
            AngularVelocityAnkleLeft: angularVelocities.ankleLeft ? angularVelocities.ankleLeft.toFixed(4) : 'N/A',
            AngularAccelerationHipLeft: angularAccelerations.hipLeft ? angularAccelerations.hipLeft.toFixed(4) : 'N/A',
            AngularAccelerationKneeLeft: angularAccelerations.kneeLeft ? angularAccelerations.kneeLeft.toFixed(4) : 'N/A',
            AngularAccelerationAnkleLeft: angularAccelerations.ankleLeft ? angularAccelerations.ankleLeft.toFixed(4) : 'N/A',
        });

        // Actualizar landmarksData con los nuevos valores
        if (results.rightHandLandmarks) {
            landmarksData.push({
                time: currentTime,
                part: 'rightArm',
                angleShoulderRight: angles.shoulderRight.toFixed(2),
                angleElbowRight: angles.elbowRight.toFixed(2),
                angleWristRight: angles.wristRight.toFixed(2),
                AngularVelocityShoulderRight: angularVelocities.shoulderRight ? angularVelocities.shoulderRight.toFixed(4) : 'N/A',
                AngularVelocityElbowRight: angularVelocities.elbowRight ? angularVelocities.elbowRight.toFixed(4) : 'N/A',
                AngularVelocityWristRight: angularVelocities.wristRight ? angularVelocities.wristRight.toFixed(4) : 'N/A',
                AngularAccelerationShoulderRight: angularAccelerations.shoulderRight ? angularAccelerations.shoulderRight.toFixed(4) : 'N/A',
                AngularAccelerationElbowRight: angularAccelerations.elbowRight ? angularAccelerations.elbowRight.toFixed(4) : 'N/A',
                AngularAccelerationWristRight: angularAccelerations.wristRight ? angularAccelerations.wristRight.toFixed(4) : 'N/A',
            });
        }

        if (results.leftHandLandmarks) {
            landmarksData.push({
                time: currentTime,
                part: 'leftArm',
                angleShoulderLeft: angles.shoulderLeft.toFixed(2),
                angleElbowLeft: angles.elbowLeft.toFixed(2),
                angleWristLeft: angles.wristLeft.toFixed(2),
                AngularVelocityShoulderLeft: angularVelocities.shoulderLeft ? angularVelocities.shoulderLeft.toFixed(4) : 'N/A',
                AngularVelocityElbowLeft: angularVelocities.elbowLeft ? angularVelocities.elbowLeft.toFixed(4) : 'N/A',
                AngularVelocityWristLeft: angularVelocities.wristLeft ? angularVelocities.wristLeft.toFixed(4) : 'N/A',
                AngularAccelerationShoulderLeft: angularAccelerations.shoulderLeft ? angularAccelerations.shoulderLeft.toFixed(4) : 'N/A',
                AngularAccelerationElbowLeft: angularAccelerations.elbowLeft ? angularAccelerations.elbowLeft.toFixed(4) : 'N/A',
                AngularAccelerationWristLeft: angularAccelerations.wristLeft ? angularAccelerations.wristLeft.toFixed(4) : 'N/A',
            });
        }

        // Actualizar el gráfico
        updateChart(currentTime, angles, angularVelocities, angularAccelerations);
    }


    // Actualizar los landmarks previos
    previousLandmarks = { ...currentLandmarks };

}

const holistic = new mpHolistic.Holistic(config);
holistic.onResults(onResults);

const calculateAngle = (a, b, c) => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    return angle > 180.0 ? angle - 360 : angle;
};


  const windowSize = 5; // Ventana para el promedio móvil
  const angleHistory = {};
  const velocityHistory = {};

function calculateAnglesAndDerivatives(results) {
    const dt = 1 / 60; // Asumiendo 60 FPS
    const degToRad = Math.PI / 180;
    const angles = {
        shoulderRight: null, elbowRight: null, wristRight: null,
        shoulderLeft: null, elbowLeft: null, wristLeft: null,
        hipRight: null, hipLeft: null, kneeRight: null, kneeLeft: null,
        ankleRight: null, ankleLeft: null
    };
    const angularVelocities = {...angles};
    const angularAccelerations = {...angles};

    if (!results.poseLandmarks) return { angles, angularVelocities, angularAccelerations };

    const trackAngularData = (joint, currentAngle) => {
        angleHistory[joint] = angleHistory[joint] || [];
        angleHistory[joint].push(currentAngle);
        if (angleHistory[joint].length > windowSize) angleHistory[joint].shift();

        if (angleHistory[joint].length >= 2) {
            const avgAngle = angleHistory[joint].reduce((a, b) => a + b) / angleHistory[joint].length;
            velocityHistory[joint] = velocityHistory[joint] || [];

            const instantVelocity = (avgAngle - angleHistory[joint][0]) / (dt * (angleHistory[joint].length - 1));
            velocityHistory[joint].push(instantVelocity);
            if (velocityHistory[joint].length > windowSize) velocityHistory[joint].shift();

            angularVelocities[joint] = velocityHistory[joint].reduce((a, b) => a + b) / velocityHistory[joint].length;

            if (velocityHistory[joint].length >= 2) {
                angularAccelerations[joint] = (angularVelocities[joint] - velocityHistory[joint][0]) / (dt * (velocityHistory[joint].length - 1));
            }
        }
    };

    const processBodyParts = (landmarks, handLandmarks, isRight) => {
        const prefix = isRight ? 'Right' : 'Left';
        const shoulder = landmarks[mpHolistic.POSE_LANDMARKS[`${prefix.toUpperCase()}_SHOULDER`]];
        const elbow = landmarks[mpHolistic.POSE_LANDMARKS[`${prefix.toUpperCase()}_ELBOW`]];
        const hip = landmarks[mpHolistic.POSE_LANDMARKS[`${prefix.toUpperCase()}_HIP`]];
        const knee = landmarks[mpHolistic.POSE_LANDMARKS[`${prefix.toUpperCase()}_KNEE`]];
        const ankle = landmarks[mpHolistic.POSE_LANDMARKS[`${prefix.toUpperCase()}_ANKLE`]];
        const foot = landmarks[mpHolistic.POSE_LANDMARKS[`${prefix.toUpperCase()}_FOOT_INDEX`]];

        const calculateAngleWithReference = (point1, point2, point3) => calculateAngle(
            {x: point2.x, y: point2.y - 0.1},
            point2,
            point3
        );

        angles[`shoulder${prefix}`] = calculateAngleWithReference(null, shoulder, elbow);
        angles[`hip${prefix}`] = calculateAngleWithReference(null, hip, knee);
        angles[`knee${prefix}`] = calculateAngle(hip, knee, ankle);
        angles[`ankle${prefix}`] = calculateAngle(knee, ankle, foot);

        if (handLandmarks) {
            const wrist = handLandmarks[0];
            const metacarpal = handLandmarks[9];

            angles[`elbow${prefix}`] = calculateAngle(shoulder, elbow, wrist);
            angles[`wrist${prefix}`] = calculateAngle(elbow, wrist, metacarpal);
        }

        [`shoulder${prefix}`, `elbow${prefix}`, `wrist${prefix}`,
         `hip${prefix}`, `knee${prefix}`, `ankle${prefix}`].forEach(joint => {
            if (angles[joint] !== null) trackAngularData(joint, angles[joint]);
        });
    };

    processBodyParts(results.poseLandmarks, results.rightHandLandmarks, true);
    processBodyParts(results.poseLandmarks, results.leftHandLandmarks, false);

    // Scale velocities and accelerations to radians
    Object.keys(angularVelocities).forEach(joint => {
        if (angularVelocities[joint] !== null) {
            angularVelocities[joint] *= degToRad;
            angularAccelerations[joint] *= degToRad;
        }
    });

    return { angles, angularVelocities, angularAccelerations };
}

function calculateTrajectoriesAndVelocities() {
    const currentTime = (Date.now() - startTime) / 1000;
    const parts = ['pose', 'leftHand', 'rightHand'];
    const fps = 60;

    parts.forEach(part => {
        if (currentLandmarks[part] && previousLandmarks[part]) {
            currentLandmarks[part].forEach((current, i) => {
                const previous = previousLandmarks[part][i];

                if (current && previous) {
                    const trajectory = {
                        x: current.x - previous.x,
                        y: current.y - previous.y,
                        z: current.z - previous.z
                    };

                    const velocity = {
                        x: trajectory.x * fps,
                        y: trajectory.y * fps,
                        z: trajectory.z * fps
                    };

                    const prevVelocityKey = `${part}_${i}`;
                    const acceleration = previousVelocities[prevVelocityKey] ? {
                        x: (velocity.x - previousVelocities[prevVelocityKey].x) * fps,
                        y: (velocity.y - previousVelocities[prevVelocityKey].y) * fps,
                        z: (velocity.z - previousVelocities[prevVelocityKey].z) * fps
                    } : { x: 0, y: 0, z: 0 };

                    const angles = calculateAngles(current, previous);
                    previousVelocities[prevVelocityKey] = velocity;

                    landmarksData.push({
                        time: currentTime.toFixed(2),
                        part,
                        landmark: i,
                        ...Object.entries({x: current.x, y: current.y, z: current.z})
                            .reduce((acc, [key, value]) => {
                                acc[key] = value.toFixed(4);
                                acc[`trajectory${key.toUpperCase()}`] = trajectory[key].toFixed(4);
                                acc[`velocity${key.toUpperCase()}`] = velocity[key].toFixed(4);
                                acc[`acceleration${key.toUpperCase()}`] = acceleration[key].toFixed(4);
                                return acc;
                            }, {}),
                        angleX: angles.qx.toFixed(4),
                        angleY: angles.qy.toFixed(4),
                        angleZ: angles.qz.toFixed(4),
                    });
                }
            });
        }
    });

    // Limit landmarksData to last 10 records
    landmarksData = landmarksData.slice(-10);
}


function calculateAngles(current, previous) {
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const dz = current.z - previous.z;

    const qx = Math.atan2(dy, dz) * (180 / Math.PI);
    const qy = Math.atan2(dx, dz) * (180 / Math.PI);
    const qz = Math.atan2(dy, dx) * (180 / Math.PI);

    return { qx, qy, qz };
}

//control panel
new controls
    .ControlPanel(controlsElement, {
        selfieMode: true,
        modelComplexity: 1,
        enableSegmentation: false,
        effect: 'background',
    })
    .add([
        fpsControl,
        new controls.Toggle({ title: 'Selfie Mode', field: 'selfieMode' }),
        new controls.SourcePicker({
            onSourceChanged: (source) => {
                videoElement.src = source;
                videoElement.play();
            },

            onFrame: async (input, size) => {
                const aspect = size.height / size.width;
                let width, height;
                if (window.innerWidth > window.innerHeight) {
                    height = window.innerHeight;
                    width = height / aspect;
                } else {
                    width = window.innerWidth;
                    height = width * aspect;
                }
                canvasElement.width = width;
                canvasElement.height = height;
                await holistic.send({ image: input });
            },
        }),
        new controls.Slider({
            title: 'Model Complexity',
            field: 'modelComplexity',
            discrete: ['Lite', 'Full', 'Heavy'],
        }),
        new controls.Toggle({ title: 'Enable Segmentation', field: 'enableSegmentation' }),
        new controls.Slider({ title: 'Effect',field: 'effect', discrete: { 'background': 'Background', 'mask': 'Foreground' },
        }),
    ])
    .on(x => {
        const options = x;
        videoElement.classList.toggle('selfie', options.selfieMode);
        activeEffect = x['effect'];
        holistic.setOptions(options);
    });


////////////////////////////Check boxes de control de articulaciones

const JOINTS = [
    'shoulderRight', 'shoulderLeft', 'elbowRight', 'elbowLeft',
    'wristRight', 'wristLeft', 'hipRight', 'hipLeft',
    'kneeRight', 'kneeLeft', 'ankleRight', 'ankleLeft'
];

const jointVisibility = JOINTS.reduce((acc, joint) => {
    acc[joint] = ['shoulderRight', 'shoulderLeft', 'elbowRight', 'elbowLeft',
                  'wristRight', 'wristLeft'].includes(joint);
    return acc;
}, {});


document.addEventListener('DOMContentLoaded', function() {
    JOINTS.forEach(joint => {
        document.getElementById(`${joint}Check`).addEventListener('change', function(e) {
            jointVisibility[joint] = e.target.checked;
            updateChartsVisibility();
        });
    });

    // Simplified start/stop button logic
    const startStopButton = document.getElementById('startButton');
    const recordButton = document.getElementById('stopButton');

    startStopButton.addEventListener('click', function() {
        isPaused = !isPaused;
        startStopButton.textContent = isPaused ? 'Resume' : 'Pause';

        // If not paused, ensure recording continues or starts
        if (!isPaused && !isRecording) {
            startRecording();
        }
    });

    recordButton.addEventListener('click', function() {
        isRecording = !isRecording;
        recordButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
    });

    // Initial setup
    startRecording();
    initChart();
});

function initChart() {
    const ctx = document.getElementById('angleChart').getContext('2d');
    const ctx2 = document.getElementById('angularVelocityChart').getContext('2d');
    const ctx3 = document.getElementById('angularAccelerationChart').getContext('2d');
    const ctx4 = document.getElementById('momentosChart').getContext('2d');

    angleChart = new Chart(ctx, {
        type: 'line',
        data: angleData,
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Tiempo (s)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Ángulo (grados)'
                    }
                }
            },
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 6,
                        font: {
                            size: 8
                        }
                    }
                }
            }
        }
    });

    angularVelocityChart = new Chart(ctx2, {
        type: 'line',
        data: angularVelocityData,
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Tiempo (s)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Velocidad Angular (rad/s)'
                    }
                }
            },
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 6,
                        font: {
                            size: 8
                        }
                    }
                }
            }
        }
    });

    angularAccelerationChart = new Chart(ctx3, {
        type: 'line',
        data: angularAccelerationData,
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Tiempo (s)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Aceleración angular (rad/s²)'
                    }
                }
            },
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 6,
                        font: {
                            size: 8
                        }
                    }
                }
            }
        }
    });

    momentosChart = new Chart(ctx4, {
        type: 'line',
        data: momentosData,
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Tiempo (s)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Momento (N·m)'
                    }
                }
            },
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 5,
                        font: {
                            size: 6
                        }
                    }
                }
            }
        }
    });
}
    // Llama a esta función cuando tu página se cargue
    initChart();

function saveRecordedData(time, angles, angularVelocities, angularAccelerations) {
    const recordedData = {
        angle: {
            labels: [],
            datasets: angleData.datasets.map(ds => ({...ds, data: []}))
        },
        angularVelocity: {
            labels: [],
            datasets: angularVelocityData.datasets.map(ds => ({...ds, data: []}))
        },
        angularAcceleration: {
            labels: [],
            datasets: angularAccelerationData.datasets.map(ds => ({...ds, data: []}))
        },
        momentos: {
            labels: [],
            datasets: momentosData.datasets.map(ds => ({...ds, data: []}))
        }
    };

    const dataProcessors = [
        { data: angles, prop: 'angle', joints: ['elbowRight', 'elbowLeft'], conversion: 1 },
        { data: angularVelocities, prop: 'angularVelocity', joints: ['elbowRight', 'elbowLeft'], conversion: Math.PI / 180 },
        { data: angularAccelerations, prop: 'angularAcceleration', joints: ['elbowRight', 'elbowLeft'], conversion: Math.PI / 180 },
        { data: angularAccelerations, prop: 'momentos', joints: ['elbowRight', 'elbowLeft'], conversion: INERCIAS.antebrazo }
    ];

    recordedData.angle.labels.push(time);
    recordedData.angularVelocity.labels.push(time);
    recordedData.angularAcceleration.labels.push(time);
    recordedData.momentos.labels.push(time);

    dataProcessors.forEach(processor => {
        processor.joints.forEach((joint, index) => {
            recordedData[processor.prop].datasets[index].data.push(
                processor.data[joint] * processor.conversion
            );
        });
    });

    return recordedData;
}


function updateChart(time, angles, angularVelocities, angularAccelerations) {
    // Skip updates if paused
    if (isPaused) return;

    const datasets = [angleData, angularVelocityData, angularAccelerationData, momentosData];
    const charts = [angleChart, angularVelocityChart, angularAccelerationChart, momentosChart];

    // Push time to all labels
    datasets.forEach(dataset => dataset.labels.push(time));

    // Update data for all joints
    JOINTS.forEach((joint, index) => {
        angleData.datasets[index].data.push(angles[joint]);

        if (index < 6) {
            const radianConversion = Math.PI / 180;
            angularVelocityData.datasets[index].data.push(angularVelocities[joint] * radianConversion);
            angularAccelerationData.datasets[index].data.push(angularAccelerations[joint] * radianConversion);
        }
    });

    // Update momentos for upper body joints
    ['elbowRight', 'shoulderRight', 'elbowLeft', 'shoulderLeft', 'wristRight', 'wristLeft']
        .forEach((joint, index) => {
            const inertiaType = joint.includes('elbow') ? 'antebrazo' :
                                joint.includes('shoulder') ? 'brazoSuperior' : 'mano';
            momentosData.datasets[index].data.push(angularAccelerations[joint] * INERCIAS[inertiaType]);
        });

    // Truncate data to last 80 points
    if (angleData.labels.length > 80) {
        datasets.forEach(dataset => {
            dataset.labels.shift();
            dataset.datasets.forEach(d => d.data.shift());
        });
    }

    // Update charts
    charts.forEach(chart => chart.update());
    updateTable();

    // Only save recorded data if recording is active
    if (isRecording) {
        saveRecordedData(time, angles, angularVelocities, angularAccelerations);
    }
}


// Function to update chart visibility
function updateChartsVisibility() {
    const charts = [angleChart, angularVelocityChart, angularAccelerationChart, momentosChart];

    charts.forEach(chart => {
        chart.data.datasets.forEach((dataset, index) => {
            dataset.hidden = !jointVisibility[JOINTS[index]];
        });
        chart.update();
    });
}

//////////////////////////

function updateTable() {
    // Only update table if not paused
    if (isPaused) return;

    const tbody = document.querySelector('#landmarksTable tbody');
    tbody.innerHTML = '';

    const lastResults = landmarksData.slice(-10);

    for (const data of lastResults) {
        const row = tbody.insertRow();
        row.insertCell().textContent = data.time;
        row.insertCell().textContent = data.part;
        row.insertCell().textContent = data.landmark;
        row.insertCell().textContent = data.x;
        row.insertCell().textContent = data.y;
        row.insertCell().textContent = data.z;
        row.insertCell().textContent = data.angleX;
        row.insertCell().textContent = data.angleY;
        row.insertCell().textContent = data.angleZ;

        if (data.part === 'rightArm') {
            const rightArmCells = [
                data.angleShoulderRight, data.angleElbowRight, data.angleWristRight,
                data.AngularVelocityShoulderRight || 'N/A',
                data.AngularVelocityElbowRight || 'N/A',
                data.AngularVelocityWristRight || 'N/A',
                data.AngularAccelerationShoulderRight || 'N/A',
                data.AngularAccelerationElbowRight || 'N/A',
                data.AngularAccelerationWristRight || 'N/A'
            ];
            rightArmCells.forEach(cellData => row.insertCell().textContent = cellData);
        } else if (data.part === 'leftArm') {
            const leftArmCells = [
                data.angleShoulderLeft, data.angleElbowLeft, data.angleWristLeft,
                data.AngularVelocityShoulderLeft || 'N/A',
                data.AngularVelocityElbowLeft || 'N/A',
                data.AngularVelocityWristLeft || 'N/A',
                data.AngularAccelerationShoulderLeft || 'N/A',
                data.AngularAccelerationElbowLeft || 'N/A',
                data.AngularAccelerationWristLeft || 'N/A'
            ];
            leftArmCells.forEach(cellData => row.insertCell().textContent = cellData);
        }
    }
}

/////


    // masa, Peso
    //sistema de referencias

    //hombros ehx= hombroIzquierdo-(hombroDerecho-hombroIzquierdo)/2
    //hombros ehy= y - (hombroDerecho-hombroIzquierdo)/2
    //hombro ehz= z - (hombroDerecho-hombroIzquierdo)/2

    //hombro ehix = codoIzquierdo - hombroIzquierdo
    //hombro ehiy = y - hombroIzquierdo
    //hombro ehiz = z - hombroIzquierdo

    //hombro ehdx = codoDerecho - hombroDerecho
    //hombro ehdy = y - hombroDerecho
    //hombro ehdz = z - hombroDerecho

    //codo ecix = muñecaIzquierda - codoIzquierda
    //codo eciy = y - codoIzquierda
    //codo eciz = z - codoIzquierda

    //codo ecdx = muñecaDerecha - codoDercho
    //codo ecdy = y - codoDercho
    //codo ecdz = z - codoDercho



    //Masa= 65;
    //MasaMano=Masa*0.0065
    //MasaAntebrazo=Masa*0.0161
    //MasaManoAntebrazo=Masa*0.0263
    //MasaBrazoSuperior=Masa*0.0263
    //MasaExtremidadSuperior=Masa*0.0490

    //Inercias en [kg.m^2]
    //InerciaMano=Masa*0.0005
    //InerciaAntebrazo=0.076
    //InerciaBrazoSuperior=0.0213




//longitud, inercia cilindro/segmento corporal
//

 //AvelocityShoulderRight: angularVelocities.shoulderRight
   // AvelocityElbowRight: angularVelocities.elbowRight


////////EXPORTAR A EXCEL
/*
document.getElementById('exportExcel').addEventListener('click', exportToExcel);

function exportToExcel() {
    try {
        if (landmarksData.length === 0) {
            alert("No hay datos para exportar.");
            return;
        }

        const ws = XLSX.utils.json_to_sheet(landmarksData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Landmarks Data");
        XLSX.writeFile(wb, "landmarks_data.xlsx");
    } catch (error) {
        console.error("Error al exportar a Excel:", error);
        alert("Hubo un error al exportar a Excel. Por favor, intenta de nuevo.");
    }
}
*/

  ///////////Para graficas
    //////////////////////////////
    /*
    if (results.poseLandmarks) {
        // Calcular ángulos
        const angleHipLeft = calculateAngle(
            results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_KNEE],
            results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_HIP],
            new PoseLandmark(results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_HIP].x,
                             results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_HIP].y - 0.1,
                             results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_HIP].z)
        );

        const angleKneeLeft = calculateAngle(
            results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_HIP],
            results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_KNEE],
            results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ANKLE]
        );

        const angleAnkleLeft = calculateAngle(
            results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_KNEE],
            results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ANKLE],
            new PoseLandmark(results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ANKLE].x,
                             results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ANKLE].y - 0.1,
                             results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ANKLE].z)
        );

        // Calcular ángulos para el lado derecho de manera similar

        // Agregar los ángulos a landmarksData
        landmarksData.push({
            // ... (datos existentes)
            angleHipLeft: angleHipLeft.toFixed(2),
            angleKneeLeft: angleKneeLeft.toFixed(2),
            angleAnkleLeft: angleAnkleLeft.toFixed(2),
            // Agregar ángulos del lado derecho
        });
    }

*/

///////////////////////////////
/*
function calculateAngle(a,b,c) {
    const radians = Math.atan2(c.getPosition().getY() - b.getPosition().getY(),
                                c.getPosition().getX() - b.getPosition().getX()) -
                     Math.atan2(a.getPosition().getY() - b.getPosition().getY(),
                                a.getPosition().getX() - b.getPosition().getX());
    const angle = Math.abs(radians * 180.0 / Math.PI);

    if (angle > 180.0) {
        angle = 360.0 - angle;
    }

    return angle;
}
*/