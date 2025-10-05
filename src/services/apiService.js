const API_BASE = 'http://localhost:3001/api';

export const savePosition = async (positionData) => {
  try {
    console.log('🚀 좌표 저장 시도:', positionData);
    
    const response = await fetch(`${API_BASE}/positions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(positionData)
    });
    
    console.log('📡 API 응답 상태:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 에러 응답:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ 좌표 저장 성공:', result);
    return result;
  } catch (error) {
    console.error('❌ 좌표 저장 실패:', error);
    return null;
  }
};

export const createOrUpdateUser = async (userData) => {
  try {
    console.log('👤 사용자 생성 시도:', userData);
    
    const response = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData)
    });
    
    console.log('📡 사용자 API 응답 상태:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 사용자 API 에러 응답:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ 사용자 생성 성공:', result);
    return result;
  } catch (error) {
    console.error('❌ 사용자 저장 실패:', error);
    return null;
  }
};

export const updateStageProgress = async (userId, stageData) => {
  try {
    const response = await fetch(`${API_BASE}/users/${userId}/progress`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stageData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('진행 상황 업데이트 실패:', error);
    return null;
  }
};

export const getPositionsBySession = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE}/positions/session/${sessionId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('좌표 조회 실패:', error);
    return null;
  }
};
