<script lang="ts">
    import {onMount} from 'svelte';
    import * as THREE from 'three';
    import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

    let container: HTMLDivElement;

    function createCircleTexture() {
        const size = 128; // Texture size
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        // Draw a white circle
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    onMount(() => {
        const width = container.clientWidth;
        const height = container.clientHeight;

        // --- Renderer, Scene, and Camera ---
        const renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 1); // dark background
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        camera.position.z = 5;

        // --- OrbitControls for Zooming and Rotation ---
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enablePan = false;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.2; // slow rotation


        // --- Load Land Mask Image and Build Land-Only Dot Geometry ---
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('landmask.png', (texture) => {
            // Create a canvas to read the land mask pixel data.
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            canvas.width = texture.image.width;
            canvas.height = texture.image.height;
            ctx.drawImage(texture.image, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            // Create a sphere geometry with a larger radius and higher resolution.
            const sphereGeo = new THREE.SphereGeometry(2, 386, 386);
            const positions = sphereGeo.attributes.position.array;
            const uvs = sphereGeo.attributes.uv.array;
            const vertexCount = sphereGeo.attributes.position.count;

            // Build arrays for filtered positions (land only) and per-vertex colors.
            const filteredPositions: number[] = [];
            const filteredColors: number[] = [];
            // Define colors.
            const baseColor = new THREE.Color(0xcccccc);    // default dot color
            const highlightColor = new THREE.Color(0x67cef6); // highlight color

            for (let i = 0; i < vertexCount; i++) {
                const i3 = i * 3;
                const i2 = i * 2;
                const u = uvs[i2];
                const v = uvs[i2 + 1];
                // Convert uv coordinates to pixel coordinates.
                const x = Math.floor(u * canvas.width);
                const y = Math.floor((1 - v) * canvas.height); // flip v because canvas y=0 is at the top
                const index = (y * canvas.width + x) * 4;
                const brightness = imageData[index]; // using the red channel
                if (brightness > 128) { // if pixel is “bright” enough (land)
                    filteredPositions.push(positions[i3], positions[i3 + 1], positions[i3 + 2]);
                    filteredColors.push(baseColor.r, baseColor.g, baseColor.b);
                }
            }

            // Create a new BufferGeometry with the land-only dots.
            const filteredGeo = new THREE.BufferGeometry();
            filteredGeo.setAttribute('position', new THREE.Float32BufferAttribute(filteredPositions, 3));
            filteredGeo.setAttribute('color', new THREE.Float32BufferAttribute(filteredColors, 3));

            // --- Create Points Object with Vertex Colors Enabled ---
            const pointsMaterial = new THREE.PointsMaterial({
                size: 0.02,
                vertexColors: true,
                alphaTest: 0.5,
                map: createCircleTexture(),
                transparent: true,
                sizeAttenuation: true,
            });
            const points = new THREE.Points(filteredGeo, pointsMaterial);
            scene.add(points);

            const logoLoader = new THREE.TextureLoader();
            logoLoader.load('favicon.png', (logoTexture) => {
                // Create a plane geometry to hold the logo
                const aspectRatio = logoTexture.image.width / logoTexture.image.height;
                const logoSize = 0.2; // Adjust this value to change logo size
                const logoGeometry = new THREE.PlaneGeometry(logoSize * aspectRatio, logoSize);

                // Create material with transparency
                const logoMaterial = new THREE.MeshBasicMaterial({
                    map: logoTexture,
                    transparent: true,
                    side: THREE.DoubleSide
                });

                const logoMesh = new THREE.Mesh(logoGeometry, logoMaterial);
                const raycasterLogo = new THREE.Raycaster();
                const mouseClick = new THREE.Vector2();

                // Add click event listener to the renderer
                renderer.domElement.addEventListener('click', (event) => {
                    const rect = renderer.domElement.getBoundingClientRect();
                    mouseClick.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    mouseClick.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                    raycasterLogo.setFromCamera(mouseClick, camera);
                    const intersects = raycasterLogo.intersectObject(logoMesh);

                    if (intersects.length > 0) {
                        window.location.href = 'https://dtdg.fr';
                    }
                });

                // Add this right after creating the logoMesh and raycasterLogo
                function onLogoPointerMove(event: MouseEvent) {
                    const rect = renderer.domElement.getBoundingClientRect();
                    mouseClick.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    mouseClick.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                    raycasterLogo.setFromCamera(mouseClick, camera);
                    const intersects = raycasterLogo.intersectObject(logoMesh);

                    if (intersects.length > 0) {
                        renderer.domElement.style.cursor = 'pointer';
                    } else {
                        renderer.domElement.style.cursor = 'default';
                    }
                }
                renderer.domElement.addEventListener('pointermove', onLogoPointerMove);

                // Position the logo tangent to the sphere
                // The sphere radius is 2 in your code
                const sphereRadius = 2;
                logoMesh.position.set(0, 0, 0);
                logoMesh.rotation.x = Math.PI / 2; // Rotate to face outward

                scene.add(logoMesh);

                // Make the logo always face the camera
                function updateLogoRotation() {
                    logoMesh.quaternion.copy(camera.quaternion);
                }

                // Add the update function to your animation loop
                const originalAnimate = animate;
                animate = function () {
                    updateLogoRotation();
                    originalAnimate();
                }
            });



            // --- Set Up Raycaster for Per-Dot Hover Detection ---
            const raycaster = new THREE.Raycaster();
            raycaster.params.Points.threshold = 0.1;
            const mouse = new THREE.Vector2();
            let hoverPoint: THREE.Vector3 | null = null;

            function onPointerMove(event: MouseEvent) {
                const rect = renderer.domElement.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObject(points);
                if (intersects.length > 0) {
                    hoverPoint = intersects[0].point;
                } else {
                    hoverPoint = null;
                }
            }

            renderer.domElement.addEventListener('pointermove', onPointerMove);
            renderer.domElement.addEventListener('pointerout', () => {
                hoverPoint = null;
            });

            // --- Animation Loop ---
            function animate() {
                requestAnimationFrame(animate);
                controls.update();

                // Update per-vertex colors based on proximity to the hover point.
                const posAttr = filteredGeo.getAttribute('position');
                const colorAttr = filteredGeo.getAttribute('color');
                let localHover: THREE.Vector3 | null = null;
                if (hoverPoint) {
                    localHover = hoverPoint.clone();
                    // Transform the hover point to the Points object's local coordinate system.
                    points.worldToLocal(localHover);
                }

                // Threshold (in local coordinates) within which a dot is highlighted.
                const thresholdDistance = 0.15;
                for (let i = 0; i < posAttr.count; i++) {
                    const i3 = i * 3;
                    const vx = posAttr.array[i3];
                    const vy = posAttr.array[i3 + 1];
                    const vz = posAttr.array[i3 + 2];
                    let t = 0; // 0 = base color; 1 = highlight color.
                    if (localHover) {
                        const dx = vx - localHover.x;
                        const dy = vy - localHover.y;
                        const dz = vz - localHover.z;
                        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (dist < thresholdDistance) {
                            // For a simple binary highlight:
                            t = 1;
                            // Alternatively, you could do: t = 1 - (dist / thresholdDistance);
                        }
                    }
                    // Interpolate between the base and highlight colors.
                    colorAttr.array[i3] = THREE.MathUtils.lerp(baseColor.r, highlightColor.r, t);
                    colorAttr.array[i3 + 1] = THREE.MathUtils.lerp(baseColor.g, highlightColor.g, t);
                    colorAttr.array[i3 + 2] = THREE.MathUtils.lerp(baseColor.b, highlightColor.b, t);
                }
                colorAttr.needsUpdate = true;

                renderer.render(scene, camera);
            }

            animate();
            // Add cleanup for the click event in the return function
            // Cleanup pointer events when unloading.
            return () => {
                renderer.domElement.removeEventListener('pointermove', onLogoPointerMove);
                renderer.domElement.removeEventListener('click', onClick);
                renderer.domElement.removeEventListener('pointermove', onPointerMove);
                renderer.domElement.removeEventListener('pointerout', () => {
                    hoverPoint = null;
                });
            };
        });

        // --- Handle Window Resize ---
        function onWindowResize() {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }

        window.addEventListener('resize', onWindowResize);
        return () => {
            window.removeEventListener('resize', onWindowResize);
            renderer.dispose();
        };
    });
</script>

<style>
  .container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
</style>

<div bind:this={container} class="container"></div>
