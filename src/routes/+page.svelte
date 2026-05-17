<script>
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import {
		PUBLIC_UMAMI_SCRIPT_URL,
		PUBLIC_UMAMI_WEBSITE_ID,
		PUBLIC_DTDG_URL
	} from '$env/static/public';

	const SPHERE_RADIUS = 2;
	const SPHERE_SEGMENTS = 128;
	const LAND_BRIGHTNESS_THRESHOLD = 128;
	const DOT_ALPHA_TEST = 0.5;
	const HOVER_THRESHOLD = 0.15;
	const LOGO_SIZE = 0.2;
	const CAMERA_DISTANCE = 5;
	const POINT_SIZE = 0.02;

	const BASE_COLOR = new THREE.Color(0xcccccc);
	const HIGHLIGHT_COLOR = new THREE.Color(0x67cef6);

	let container;

	function createCircleTexture() {
		const size = 128;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;

		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, size, size);

		ctx.beginPath();
		ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
		ctx.fillStyle = 'white';
		ctx.fill();

		return new THREE.CanvasTexture(canvas);
	}

	onMount(() => {
		const width = container.clientWidth;
		const height = container.clientHeight;

		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(width, height);
		renderer.setClearColor(0x000000, 1);
		container.appendChild(renderer.domElement);

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
		camera.position.z = CAMERA_DISTANCE;

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.enablePan = false;
		controls.autoRotate = true;
		controls.autoRotateSpeed = 0.2;

		const textureLoader = new THREE.TextureLoader();
		textureLoader.load(
			'landmask.png',
			(texture) => {
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');
				if (!ctx) return;
				canvas.width = texture.image.width;
				canvas.height = texture.image.height;
				ctx.drawImage(texture.image, 0, 0);
				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

				const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
				const positions = sphereGeo.attributes.position.array;
				const uvs = sphereGeo.attributes.uv.array;
				const vertexCount = sphereGeo.attributes.position.count;

				const filteredPositions = [];
				const filteredColors = [];

				for (let i = 0; i < vertexCount; i++) {
					const i3 = i * 3;
					const i2 = i * 2;
					const u = uvs[i2];
					const v = uvs[i2 + 1];
					const x = Math.floor(u * canvas.width);
					const y = Math.floor((1 - v) * canvas.height);
					const index = (y * canvas.width + x) * 4;
					const brightness = imageData[index];

					if (brightness > LAND_BRIGHTNESS_THRESHOLD) {
						filteredPositions.push(positions[i3], positions[i3 + 1], positions[i3 + 2]);
						filteredColors.push(BASE_COLOR.r, BASE_COLOR.g, BASE_COLOR.b);
					}
				}

				const filteredGeo = new THREE.BufferGeometry();
				filteredGeo.setAttribute('position', new THREE.Float32BufferAttribute(filteredPositions, 3));
				filteredGeo.setAttribute('color', new THREE.Float32BufferAttribute(filteredColors, 3));

				const pointsMaterial = new THREE.PointsMaterial({
					size: POINT_SIZE,
					vertexColors: true,
					alphaTest: DOT_ALPHA_TEST,
					map: createCircleTexture(),
					transparent: true,
					sizeAttenuation: true
				});
				const points = new THREE.Points(filteredGeo, pointsMaterial);
				scene.add(points);

				const logoLoader = new THREE.TextureLoader();
				logoLoader.load(
					'favicon.png',
					(logoTexture) => {
						const aspectRatio = logoTexture.image.width / logoTexture.image.height;
						const logoGeometry = new THREE.PlaneGeometry(LOGO_SIZE * aspectRatio, LOGO_SIZE);

						const logoMaterial = new THREE.MeshBasicMaterial({
							map: logoTexture,
							transparent: true,
							side: THREE.DoubleSide
						});

						const logoMesh = new THREE.Mesh(logoGeometry, logoMaterial);
						const raycasterLogo = new THREE.Raycaster();
						const mouseClick = new THREE.Vector2();

						function onLogoClick(event) {
							const rect = renderer.domElement.getBoundingClientRect();
							mouseClick.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
							mouseClick.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

							raycasterLogo.setFromCamera(mouseClick, camera);
							const intersects = raycasterLogo.intersectObject(logoMesh);

							if (intersects.length > 0) {
								window.location.href = PUBLIC_DTDG_URL || 'https://dtdg.fr';
							}
						}

						function onLogoPointerMove(event) {
							const rect = renderer.domElement.getBoundingClientRect();
							mouseClick.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
							mouseClick.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

							raycasterLogo.setFromCamera(mouseClick, camera);
							const intersects = raycasterLogo.intersectObject(logoMesh);

							renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
						}

						renderer.domElement.addEventListener('click', onLogoClick);
						renderer.domElement.addEventListener('pointermove', onLogoPointerMove);

						logoMesh.position.set(0, 0, 0);
						logoMesh.rotation.x = Math.PI / 2;

						scene.add(logoMesh);

						function updateLogoRotation() {
							logoMesh.quaternion.copy(camera.quaternion);
						}

						const originalAnimate = animate;
						animate = function () {
							updateLogoRotation();
							originalAnimate();
						};
					},
					undefined,
					(error) => {
						console.error('Failed to load logo texture:', error);
					}
				);

				const raycaster = new THREE.Raycaster();
				raycaster.params.Points.threshold = 0.1;
				const mouse = new THREE.Vector2();
				let hoverPoint = null;
				let lastHoverPoint = null;
				let colorsNeedUpdate = false;

				function onPointerMove(event) {
					const rect = renderer.domElement.getBoundingClientRect();
					mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
					mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
					raycaster.setFromCamera(mouse, camera);
					const intersects = raycaster.intersectObject(points);
					hoverPoint = intersects.length > 0 ? intersects[0].point : null;
				}

				function onPointerOut() {
					hoverPoint = null;
				}

				renderer.domElement.addEventListener('pointermove', onPointerMove);
				renderer.domElement.addEventListener('pointerout', onPointerOut);

				const posAttr = filteredGeo.getAttribute('position');
				const colorAttr = filteredGeo.getAttribute('color');

				function animate() {
					requestAnimationFrame(animate);
					controls.update();

					if (hoverPoint !== lastHoverPoint) {
						lastHoverPoint = hoverPoint ? hoverPoint.clone() : null;
						colorsNeedUpdate = true;
					}

					if (colorsNeedUpdate) {
						let localHover = null;
						if (hoverPoint) {
							localHover = hoverPoint.clone();
							points.worldToLocal(localHover);
						}

						for (let i = 0; i < posAttr.count; i++) {
							const i3 = i * 3;
							const vx = posAttr.array[i3];
							const vy = posAttr.array[i3 + 1];
							const vz = posAttr.array[i3 + 2];
							let t = 0;

							if (localHover) {
								const dx = vx - localHover.x;
								const dy = vy - localHover.y;
								const dz = vz - localHover.z;
								const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
								if (dist < HOVER_THRESHOLD) {
									t = 1;
								}
							}

							colorAttr.array[i3] = THREE.MathUtils.lerp(BASE_COLOR.r, HIGHLIGHT_COLOR.r, t);
							colorAttr.array[i3 + 1] = THREE.MathUtils.lerp(BASE_COLOR.g, HIGHLIGHT_COLOR.g, t);
							colorAttr.array[i3 + 2] = THREE.MathUtils.lerp(BASE_COLOR.b, HIGHLIGHT_COLOR.b, t);
						}
						colorAttr.needsUpdate = true;
						colorsNeedUpdate = false;
					}

					renderer.render(scene, camera);
				}

				animate();

				return () => {
					renderer.domElement.removeEventListener('pointermove', onLogoPointerMove);
					renderer.domElement.removeEventListener('click', onLogoClick);
					renderer.domElement.removeEventListener('pointermove', onPointerMove);
					renderer.domElement.removeEventListener('pointerout', onPointerOut);
					renderer.dispose();
				};
			},
			undefined,
			(error) => {
				console.error('Failed to load landmask texture:', error);
			}
		);

		function onWindowResize() {
			const w = container.clientWidth;
			const h = container.clientHeight;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		}

		function onWebGLContextLost(event) {
			event.preventDefault();
			console.warn('WebGL context lost. Attempting to restore...');
		}

		function onWebGLContextRestored() {
			console.log('WebGL context restored.');
			renderer.setSize(container.clientWidth, container.clientHeight);
		}

		renderer.domElement.addEventListener('webglcontextlost', onWebGLContextLost);
		renderer.domElement.addEventListener('webglcontextrestored', onWebGLContextRestored);

		window.addEventListener('resize', onWindowResize);
		return () => {
			window.removeEventListener('resize', onWindowResize);
			renderer.domElement.removeEventListener('webglcontextlost', onWebGLContextLost);
			renderer.domElement.removeEventListener('webglcontextrestored', onWebGLContextRestored);
			renderer.dispose();
		};
	});
</script>

<svelte:head>
	<script defer src={PUBLIC_UMAMI_SCRIPT_URL} data-website-id={PUBLIC_UMAMI_WEBSITE_ID}></script>
</svelte:head>

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
