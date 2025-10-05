import * as THREE from 'three';

/**
 * 주어진 3D 객체(Scene 또는 Group) 내에서 'Lights_' 접두사가 붙은 모든 Mesh를 찾아
 * 해당 오브젝트의 바닥 중앙에 SpotLight를 자동으로 추가합니다.
 * * @param {THREE.Object3D} sceneOrGroup - 조명을 추가할 대상이 되는 씬, 그룹 또는 메시 객체.
 * @param {number} offset - 오브젝트 바닥에서 조명을 설치할 수직 오프셋 (기본값: 2)
 * @param {number} angle - 스포트라이트의 원뿔 각도 (기본값: Math.PI / 6, 30도)
 * @param {number} penumbra - 스포트라이트의 반음부 (0.0=날카로움, 1.0=부드러움) (기본값: 0.5)
 * @param {number} intensity - 스포트라이트의 광도 (기본값: 5000)
 */
export function autoGenerateLights(
    sceneOrGroup, 
    offset = 2, 
    angle = Math.PI / 6, 
    penumbra = 0.5,
    intensity = 5000 // 강도를 높여 눈에 띄게 설정
) {
    // 1. [수정] 유효성 검사: THREE.Object3D 인스턴스인지 확인 (THREE.Scene, THREE.Group 모두 포함)
    if (!(sceneOrGroup instanceof THREE.Object3D)) {
        console.error("autoGenerateLights: 제공된 객체는 THREE.Object3D 인스턴스가 아닙니다. (조명 생성을 건너뜁니다.)");
        return;
    }

    let lightCount = 0;
    const targetPrefix = 'Lights_';

    // 2. 씬을 순회하며 대상 오브젝트와 모든 메시의 그림자 설정을 활성화
    sceneOrGroup.traverse((object) => {
        if (object.isMesh) {
            // 모든 메시가 그림자를 드리우고 받을 수 있도록 기본 설정
            object.castShadow = true;
            object.receiveShadow = true;
        }

        // 3. 'Lights_' 접두사가 붙은 Mesh 객체를 찾아 조명 추가
        if (object.isMesh && object.name.startsWith(targetPrefix)) {
            
            // 3-1. 경계 상자(Bounding Box) 계산 및 바닥 위치 찾기
            const box = new THREE.Box3().setFromObject(object);
            const bottomY = box.min.y;
            const centerX = (box.min.x + box.max.x) / 2;
            const centerZ = (box.min.z + box.max.z) / 2;
            
            // 조명 위치: 바닥에서 지정된 오프셋만큼 아래
            const lightPosition = new THREE.Vector3(centerX, bottomY - offset, centerZ);

            // 3-2. SpotLight 생성 및 설정
            const spotlight = new THREE.SpotLight(0xffffff, intensity, 0, angle, penumbra);
            spotlight.position.copy(lightPosition);
            spotlight.castShadow = true; // 스포트라이트가 그림자를 드리우도록 설정
            
            // 그림자 맵 해상도 설정 (품질 향상)
            spotlight.shadow.mapSize.width = 1024;
            spotlight.shadow.mapSize.height = 1024;
            spotlight.shadow.radius = 2;

            // 3-3. 조명 타겟 설정 (조명이 아래를 향하도록 설정)
            const target = new THREE.Object3D();
            target.position.set(centerX, bottomY - offset - 1, centerZ); // 조명 위치보다 더 아래
            spotlight.target = target;

            // 3-4. 상위 그룹에 조명과 타겟 추가
            sceneOrGroup.add(spotlight);
            sceneOrGroup.add(target);
            
            lightCount++;
            console.log(`✅ 조명 추가됨: ${object.name} (Y: ${lightPosition.y.toFixed(2)})`);
        }
    });

    if (lightCount === 0) {
        console.warn(`❌ 씬에서 '${targetPrefix}' 접두사가 붙은 Mesh를 찾지 못했습니다.`);
    }
}