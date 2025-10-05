// 📦 WaterShader.js (좌우 명암 불균형 해결 및 Banding 제거 최종)

import * as THREE from 'three';
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

// ----------------------------------------------------------------------
// 1. 상수 설정 (최소한의 색상과 높은 반짝임으로 다이나믹스 강조)
// ----------------------------------------------------------------------
const WAVE_SCALE =0.09;      
const WAVE_SCALE_2 = 0.3;    
const WAVE_SCALE_3 = 0.1;   

const FLOW_SPEED_1 = new THREE.Vector2(0.015, 0.015);
const FLOW_SPEED_2 = new THREE.Vector2(-0.051, 0.0125);
const FLOW_SPEED_3 = new THREE.Vector2(0.013, -0.012); 

const WATER_COLOR_BASE = new THREE.Color(0x33BFFF); // 맑은 파란색
const WATER_COLOR_SPECULAR = new THREE.Color(0xFFFFFF); // 순수 흰색 반짝임

const FRESNEL_POWER = 3.0; 
const SPECULAR_POWER = 500.0; 
const OPACITY = 0.9; 

// ----------------------------------------------------------------------
// 2. WaterShader 클래스 정의 
// ----------------------------------------------------------------------
class WaterShader { 

    clock = new THREE.Clock();
    waterMesh = null;
    uniforms = null;
    renderer = null;
    camera = null; 
    isUnderwater = false;
    waterColor = WATER_COLOR_BASE; 
    isBoxGeometry = false; 
    normalMap1 = null; 
    normalMap2 = null; 
    normalMap3 = null; 

    constructor() {
        console.log("🌊 WaterShader Package: 인스턴스 준비 완료. (최종 해결 버전)"); 
    }

    init(scene, renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        
        this.loadNormalMaps(() => {
            this.processScene(scene);
            
            if (this.waterMesh) {
                this.renderer.setAnimationLoop(() => this.animate());
            }
        });
        scene.fog = new THREE.Fog(0xCCCCCC, 100, 1000); 
    }
    
    loadNormalMaps(callback) {
        const loader = new THREE.TextureLoader();
        const file1 = 'water_normal0.jpg'; 
        const file2 = 'water_normal1.jpg';
        const file3 = 'water_normal2.jpg'; 
        
        let loadedCount = 0;
        const totalToLoad = 3; 

        const onTextureLoaded = (texture, index) => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping; 
            if (index === 1) this.normalMap1 = texture;
            if (index === 2) this.normalMap2 = texture;
            if (index === 3) this.normalMap3 = texture; 
            loadedCount++;
            if (loadedCount === totalToLoad) {
                console.log(`✅ ${totalToLoad}개의 노말맵 로드 완료.`);
                callback();
            }
        };

        loader.load(file1, (texture) => onTextureLoaded(texture, 1), undefined, (err) => console.error(`Normal Map 1 로드 실패: ${err}`));
        loader.load(file2, (texture) => onTextureLoaded(texture, 2), undefined, (err) => console.error(`Normal Map 2 로드 실패: ${err}`));
        loader.load(file3, (texture) => onTextureLoaded(texture, 3), undefined, (err) => console.error(`Normal Map 3 로드 실패: ${err}`)); 
    }
    
    processScene(scene) {
        scene.traverse((object) => {
            if (object.name === 'water' && object instanceof THREE.Mesh) {
                this.waterMesh = object;
                this.waterMesh.geometry.computeBoundingBox(); 
                this.isBoxGeometry = (this.waterMesh.geometry instanceof THREE.BoxGeometry);
                
                if (this.isBoxGeometry) {
                    object.material = new THREE.MeshBasicMaterial({ color: this.waterColor, transparent: true, opacity: OPACITY, side: THREE.DoubleSide });
                } else {
                    this.setupShaderMaterial();
                }
            }
        });
        if (!this.waterMesh) {
            console.warn("⚠️ 'water' 메쉬를 씬에서 찾을 수 없습니다.");
        }
    }

    setupShaderMaterial() {
        this.uniforms = {
            u_time: { value: 0.0 }, 
            u_waterColorBase: { value: WATER_COLOR_BASE }, 
            u_waterColorSpec: { value: WATER_COLOR_SPECULAR }, 
            u_lightDir: { value: new THREE.Vector3(0.5, 0.8, -0.2).normalize() },
            
            u_normalMap1: { value: this.normalMap1 },
            u_normalMap2: { value: this.normalMap2 },
            u_normalMap3: { value: this.normalMap3 }, 
            
            u_waveScale: { value: new THREE.Vector2(WAVE_SCALE, WAVE_SCALE) }, 
            u_waveScale2: { value: new THREE.Vector2(WAVE_SCALE_2, WAVE_SCALE_2) }, 
            u_waveScale3: { value: new THREE.Vector2(WAVE_SCALE_3, WAVE_SCALE_3) }, 

            u_flowSpeed1: { value: FLOW_SPEED_1 }, 
            u_flowSpeed2: { value: FLOW_SPEED_2 }, 
            u_flowSpeed3: { value: FLOW_SPEED_3 }, 

            u_fresnelPower: { value: FRESNEL_POWER }, 
            u_specularPower: { value: SPECULAR_POWER },
            u_opacity: { value: OPACITY }, 
            u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) } 
        };

        const waterMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: this.getVertexShader(),
            fragmentShader: this.getFragmentShader(),
            transparent: true, 
            lights: false, 
            side: THREE.DoubleSide,
            defines: { 
                USE_UV: ''
            }
        });

        this.waterMesh.material = waterMaterial;
    }
    
    checkUnderwaterStatus() {
        if (!this.camera || !this.waterMesh || !this.waterMesh.geometry.boundingBox) return;
        
        const box = this.waterMesh.geometry.boundingBox.clone();
        box.applyMatrix4(this.waterMesh.matrixWorld);
        
        const waterY = this.waterMesh.getWorldPosition(new THREE.Vector3()).y;
        const isInside = this.camera.position.y < waterY;

        if (isInside !== this.isUnderwater) {
            this.isUnderwater = isInside;
            const parentScene = this.camera.parent; 
            
            if (parentScene && parentScene instanceof THREE.Scene) {
                if (this.isUnderwater) {
                    parentScene.fog = new THREE.Fog(WATER_COLOR_BASE.getHex(), 1, 30); 
                    console.log('💧 물속으로 진입: 안개 필터 적용');
                } else {
                    parentScene.fog = new THREE.Fog(0xCCCCCC, 100, 1000); 
                    console.log('☀️ 물 밖으로 나옴: 원래 안개 설정으로 복구');
                }
            }
        }
    }

    animate() {
        if (this.uniforms) {
            this.uniforms.u_time.value = this.clock.getElapsedTime();
            this.uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
        }
        this.checkUnderwaterStatus(); 
    }

    getVertexShader() {
        return `
            varying vec3 v_position;
            varying vec2 v_uv;
            varying vec4 v_worldPosition; 
            void main() {
                v_position = position;
                v_uv = uv; 
                v_worldPosition = modelMatrix * vec4(position, 1.0); 
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
    }

    getFragmentShader() {
        return `
            uniform float u_time;
            uniform vec3 u_waterColorBase; 
            uniform vec3 u_waterColorSpec; 
            uniform vec3 u_lightDir; 
            uniform sampler2D u_normalMap1;
            uniform sampler2D u_normalMap2;
            uniform sampler2D u_normalMap3; 
            uniform vec2 u_waveScale;
            uniform vec2 u_waveScale2; 
            uniform vec2 u_waveScale3; 
            uniform vec2 u_flowSpeed1;
            uniform vec2 u_flowSpeed2; 
            uniform vec2 u_flowSpeed3; 
            uniform float u_fresnelPower; 
            uniform float u_specularPower; 
            uniform float u_opacity; 
            uniform vec2 u_resolution; 

            varying vec3 v_position; 
            varying vec2 v_uv; 
            varying vec4 v_worldPosition; 

            // 단층 현상 완화를 위한 Dithering 함수
            vec3 applyDither(vec3 color, vec2 fragCoord) {
                float dither_threshold_map[16];
                dither_threshold_map[0] = 1.0/17.0; dither_threshold_map[1] = 9.0/17.0; dither_threshold_map[2] = 3.0/17.0; dither_threshold_map[3] = 11.0/17.0;
                dither_threshold_map[4] = 13.0/17.0; dither_threshold_map[5] = 5.0/17.0; dither_threshold_map[6] = 15.0/17.0; dither_threshold_map[7] = 7.0/17.0;
                dither_threshold_map[8] = 4.0/17.0; dither_threshold_map[9] = 12.0/17.0; dither_threshold_map[10] = 2.0/17.0; dither_threshold_map[11] = 10.0/17.0;
                dither_threshold_map[12] = 16.0/17.0; dither_threshold_map[13] = 8.0/17.0; dither_threshold_map[14] = 14.0/17.0; dither_threshold_map[15] = 6.0/17.0;

                int x = int(mod(fragCoord.x, 4.0));
                int y = int(mod(fragCoord.y, 4.0));
                int index = x + y * 4;
                float dither_val = dither_threshold_map[index] * 2.0 / 255.0; 

                return color + dither_val;
            }

            void main() {
                // 1. UV, 2. 노말맵 합성
                vec2 uv_scaled = v_uv * u_waveScale;
                vec2 uv_scaled2 = v_uv * u_waveScale2;
                vec2 uv_scaled3 = v_uv * u_waveScale3;
                
                vec2 uv1 = uv_scaled + u_flowSpeed1 * u_time;
                vec2 uv2 = uv_scaled2 + u_flowSpeed2 * u_time;
                vec2 uv3 = uv_scaled3 + u_flowSpeed3 * u_time; 
                
                vec3 normal1 = texture2D(u_normalMap1, uv1).rgb * 2.0 - 1.0;
                vec3 normal2 = texture2D(u_normalMap2, uv2).rgb * 2.0 - 1.0;
                vec3 normal3 = texture2D(u_normalMap3, uv3).rgb * 2.0 - 1.0; 
                
                vec3 approximatedNormal = normalize(vec3(
                    normal1.xy * 1.0 + normal2.xy * 0.8 + normal3.xy * 0.5, 
                    1.0 
                ));
                
                // 3. 조명 계산 (난반사)
                float diff = max(0.0, dot(approximatedNormal, u_lightDir)); 
                
                // 4. 프레넬 효과
                vec3 viewDir = normalize(cameraPosition - v_worldPosition.xyz);
                float fresnel = pow(1.0 - max(0.0, dot(viewDir, approximatedNormal)), u_fresnelPower);
                
                // 5. 스페큘러 효과
                vec3 reflectDir = reflect(-u_lightDir, approximatedNormal);
                float spec = pow(max(0.0, dot(viewDir, reflectDir)), u_specularPower); 

                // 6. 최종 색상 합성 (좌우 명암 불균형 보정 로직)
                
                // 난반사 기반 명암 계수 (최소 70% 밝기 보장)
                float lightFactor = 0.7 + diff * 0.3; 
                
                // 🚨 UV.x 기반 보정: 좌우 명암 차이를 상쇄 (0.1은 보정 강도)
                // v_uv.x * 2.0 - 1.0 은 좌측(-1.0)부터 우측(1.0)까지의 값을 생성합니다.
                lightFactor += 0.1 * (v_uv.x * 2.0 - 1.0); 
                lightFactor = clamp(lightFactor, 0.5, 1.0); // 최종 밝기를 50% 이하로 떨어지지 않게 보장
                
                vec3 finalColor = u_waterColorBase * lightFactor; 

                // 프레넬 (가장자리 반사광) 추가
                finalColor += u_waterColorBase * fresnel * 0.5; 
                
                // 스페큘러 (하이라이트/반짝임) 추가
                finalColor += u_waterColorSpec * spec; 

                // Dithering 적용
                finalColor = applyDither(finalColor, gl_FragCoord.xy);
                
                gl_FragColor = vec4(finalColor, u_opacity); 
            }
        `;
    }
}

// ----------------------------------------------------------------------
// 3. WaterController 컴포넌트 정의 및 EXPORT
// ----------------------------------------------------------------------

export function WaterController() { 
    const { scene, gl, camera } = useThree(); 

    useEffect(() => {
        const shaderInstance = new WaterShader(); 
        shaderInstance.init(scene, gl, camera); 

        return () => {
            gl.setAnimationLoop(null); 
            console.log('🌊 WaterShader: 애니메이션 루프 정지');
        };
    }, [scene, gl, camera]); 

    return null; 
}