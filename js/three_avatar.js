class AvatarViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.init();
        this.initializeControls();
    }

    init() {
        // Scene setup with improved performance settings
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.5, 2);

        // Renderer setup with performance optimizations
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Controls setup
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 0.5;
        this.controls.zoomSpeed = 0.8;

        // Avatar group setup - Mantiene la orientación del avatar de KTK
        this.skeletonGroup = new THREE.Group();
        this.skeletonGroup.position.y = 1;
        this.scene.add(this.skeletonGroup);

        // Materials cache para mejor rendimiento
        this.materials = {
            body: new THREE.LineBasicMaterial({
                color: 0xFF0000,
                linewidth: 2
            }),
            face: new THREE.LineBasicMaterial({
                color: 0xff9900,
                linewidth: 1
            }),
            hands: new THREE.LineBasicMaterial({
                color: 0xFFFF00,
                linewidth: 2
            })
        };

        this.pointSizes = {
            face: 0.003,    // Reduced face point size
            hand: 0.005,    // Medium size for hand points
            body: 0.01      // Original size for body points
        };

        this.addGrid();
        this.addLights();
        this.addAxisHelper();

        // Performance optimization: Only render when necessary
        this.isAnimating = true;
        this.animate();

        // Handle window resizing
        window.addEventListener('resize', () => this.resize());
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(0, 1, 1);
        this.scene.add(mainLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
        backLight.position.set(0, 1, -1);
        this.scene.add(backLight);
    }

    addGrid() {
        const gridHelper = new THREE.GridHelper(4, 20, 0x444444, 0x222222);
        gridHelper.position.y = 0;
        this.scene.add(gridHelper);

        const planeGeometry = new THREE.PlaneGeometry(4, 4);
        const planeMaterial = new THREE.MeshBasicMaterial({
            color: 0x222222,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        this.scene.add(plane);
    }

    updateSkeleton(landmarks) {
        while(this.skeletonGroup.children.length > 0) {
            const child = this.skeletonGroup.children[0];
            child.geometry.dispose();
            child.material.dispose();
            this.skeletonGroup.remove(child);
        }

        // Visualiza los landmarks recibidos con tamaños diferentes según el tipo
        Object.entries(landmarks).forEach(([key, point]) => {
            if (point && point.x !== undefined) {
                let pointSize = this.pointSizes.body;
                let color = 0x00ffff;

                if (key.startsWith('face_')) {
                    pointSize = this.pointSizes.face;
                    color = 0xffff00;
                } else if (key.includes('hand_')) {
                    pointSize = this.pointSizes.hand;
                    color = 0xff9900;
                }

                const geometry = new THREE.SphereGeometry(pointSize);
                const material = new THREE.MeshBasicMaterial({ color });
                const sphere = new THREE.Mesh(geometry, material);
                sphere.position.set(point.x, point.y, point.z);
                this.skeletonGroup.add(sphere);
            }
        });

        // Crear las conexiones desde KTK
        if (landmarks.connections) {
            this.createConnectionsFromKTK(landmarks, landmarks.connections);
        }
    }

    createConnectionsFromKTK(landmarks, connections) {
        // Crear las líneas para cada grupo de conexiones
        connections.forEach(connection => {
            const [start, end] = connection;
            if (landmarks[start] && landmarks[end]) {
                let material = this.materials.body;

                // Determinar el material basado en el tipo de conexión
                if (start.startsWith('face_') || end.startsWith('face_')) {
                    material = this.materials.face;
                } else if ((start.includes('hand_') || end.includes('hand_'))) {
                    material = this.materials.hands;
                }

                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(
                        landmarks[start].x,
                        landmarks[start].y,
                        landmarks[start].z
                    ),
                    new THREE.Vector3(
                        landmarks[end].x,
                        landmarks[end].y,
                        landmarks[end].z
                    )
                ]);
                const line = new THREE.Line(geometry, material);
                this.skeletonGroup.add(line);
            }
        });
    }


    animate() {
        if (this.isAnimating) {
            requestAnimationFrame(() => this.animate());
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        }
    }

    resize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    initializeControls() {
        const controlsDiv = document.createElement('div');
        controlsDiv.style.position = 'absolute';
        controlsDiv.style.top = '10px';
        controlsDiv.style.right = '10px';
        controlsDiv.style.background = 'rgba(0, 0, 0, 0.7)';
        controlsDiv.style.padding = '10px';
        controlsDiv.style.borderRadius = '5px';

        const viewButtons = {
            'Front View': { x: 0, y: 0, z: 2 },
            'Side View': { x: 2, y: 0, z: 0 },
            'Top View': { x: 0, y: 2, z: 0 }
        };

        Object.entries(viewButtons).forEach(([name, position]) => {
            const button = document.createElement('button');
            button.textContent = name;
            button.style.margin = '5px';
            button.style.padding = '5px 10px';
            button.style.backgroundColor = '#444';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '3px';
            button.style.cursor = 'pointer';

            button.addEventListener('mouseenter', () => {
                button.style.backgroundColor = '#555';
            });

            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = '#444';
            });

            button.addEventListener('click', () => {
                this.setCameraPosition(position.x, position.y, position.z);
            });

            controlsDiv.appendChild(button);
        });

        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset View';
        resetButton.style.margin = '5px';
        resetButton.style.padding = '5px 10px';
        resetButton.style.backgroundColor = '#665';
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '3px';
        resetButton.style.cursor = 'pointer';
        resetButton.addEventListener('click', () => this.resetView());
        controlsDiv.appendChild(resetButton);

        this.container.appendChild(controlsDiv);
    }

    addAxisHelper() {
        const axisHelper = new THREE.AxesHelper(1);
        this.scene.add(axisHelper);
    }

    setCameraPosition(x, y, z) {
        gsap.to(this.camera.position, {
            x: x,
            y: y,
            z: z,
            duration: 1,
            ease: 'power2.inOut',
            onUpdate: () => this.controls.update()
        });
    }

    resetView() {
        gsap.to(this.camera.position, {
            x: 0,
            y: 1.5,
            z: 2,
            duration: 1,
            ease: 'power2.inOut',
            onUpdate: () => this.controls.update()
        });
    }
}