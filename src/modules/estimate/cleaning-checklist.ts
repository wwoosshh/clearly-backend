import { CleaningType } from '@prisma/client';

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
}

export interface ChecklistTemplate {
  cleaningType: CleaningType;
  label: string;
  items: ChecklistItem[];
}

/** 청소 유형별 표준 체크리스트 */
export const CLEANING_CHECKLISTS: Record<string, ChecklistTemplate> = {
  MOVE_IN: {
    cleaningType: 'MOVE_IN',
    label: '입주 청소',
    items: [
      { key: 'floor', label: '바닥 청소 (걸레질/왁스)', required: true },
      { key: 'window', label: '창문/유리 청소', required: true },
      { key: 'bathroom', label: '화장실 청소 (변기/세면대/타일)', required: true },
      { key: 'kitchen', label: '주방 청소 (싱크대/가스레인지/후드)', required: true },
      { key: 'veranda', label: '베란다 청소', required: true },
      { key: 'aircon', label: '에어컨 필터 청소', required: false },
      { key: 'closet', label: '붙박이장/수납장 내부 청소', required: false },
      { key: 'light', label: '조명/스위치 청소', required: false },
      { key: 'entrance', label: '현관/신발장 청소', required: true },
    ],
  },
  MOVE_OUT: {
    cleaningType: 'MOVE_OUT',
    label: '이사 후 청소',
    items: [
      { key: 'floor', label: '바닥 청소 (걸레질/왁스)', required: true },
      { key: 'window', label: '창문/유리 청소', required: true },
      { key: 'bathroom', label: '화장실 청소 (변기/세면대/타일)', required: true },
      { key: 'kitchen', label: '주방 청소 (싱크대/가스레인지/후드)', required: true },
      { key: 'veranda', label: '베란다 청소', required: true },
      { key: 'wallpaper', label: '벽지 얼룩 제거', required: false },
      { key: 'closet', label: '붙박이장/수납장 내부 청소', required: false },
      { key: 'entrance', label: '현관/신발장 청소', required: true },
      { key: 'trash', label: '잔여 쓰레기/폐기물 처리', required: false },
    ],
  },
  FULL: {
    cleaningType: 'FULL',
    label: '전체 청소',
    items: [
      { key: 'floor', label: '바닥 청소', required: true },
      { key: 'window', label: '창문/유리 청소', required: true },
      { key: 'bathroom', label: '화장실 청소', required: true },
      { key: 'kitchen', label: '주방 청소', required: true },
      { key: 'veranda', label: '베란다 청소', required: true },
      { key: 'furniture', label: '가구 표면/먼지 청소', required: true },
      { key: 'aircon', label: '에어컨 필터 청소', required: false },
      { key: 'light', label: '조명/스위치 청소', required: false },
    ],
  },
  OFFICE: {
    cleaningType: 'OFFICE',
    label: '사무실 청소',
    items: [
      { key: 'floor', label: '바닥 청소 (카펫/타일)', required: true },
      { key: 'window', label: '창문/유리 청소', required: true },
      { key: 'desk', label: '책상/회의실 정리', required: true },
      { key: 'bathroom', label: '화장실 청소', required: true },
      { key: 'kitchen', label: '탕비실/주방 청소', required: false },
      { key: 'aircon', label: '에어컨 필터 청소', required: false },
      { key: 'trash', label: '쓰레기 처리', required: true },
    ],
  },
  STORE: {
    cleaningType: 'STORE',
    label: '상가 청소',
    items: [
      { key: 'floor', label: '바닥 청소', required: true },
      { key: 'window', label: '창문/유리/간판 청소', required: true },
      { key: 'bathroom', label: '화장실 청소', required: true },
      { key: 'kitchen', label: '주방/조리 공간 청소', required: false },
      { key: 'exterior', label: '외부/입구 청소', required: false },
      { key: 'trash', label: '쓰레기/폐기물 처리', required: true },
    ],
  },
  CONSTRUCTION: {
    cleaningType: 'CONSTRUCTION',
    label: '준공 청소',
    items: [
      { key: 'dust', label: '분진/먼지 제거', required: true },
      { key: 'floor', label: '바닥 청소 (시멘트/접착제 제거)', required: true },
      { key: 'window', label: '창문/유리 청소 (스티커 제거)', required: true },
      { key: 'bathroom', label: '화장실 청소', required: true },
      { key: 'kitchen', label: '주방 청소', required: true },
      { key: 'veranda', label: '베란다 청소', required: true },
      { key: 'paint', label: '페인트 자국 제거', required: false },
      { key: 'entrance', label: '현관/복도 청소', required: true },
    ],
  },
  AIRCON: {
    cleaningType: 'AIRCON',
    label: '에어컨 청소',
    items: [
      { key: 'filter', label: '필터 세척', required: true },
      { key: 'evaporator', label: '증발기(열교환기) 세척', required: true },
      { key: 'drain', label: '배수관 청소', required: true },
      { key: 'cover', label: '외부 커버/패널 청소', required: true },
      { key: 'test', label: '작동 테스트', required: true },
    ],
  },
  CARPET: {
    cleaningType: 'CARPET',
    label: '카펫 청소',
    items: [
      { key: 'vacuum', label: '진공 청소', required: true },
      { key: 'stain', label: '얼룩 제거', required: true },
      { key: 'wash', label: '스팀/샴푸 세척', required: true },
      { key: 'dry', label: '건조 처리', required: true },
      { key: 'deodorize', label: '탈취 처리', required: false },
    ],
  },
  EXTERIOR: {
    cleaningType: 'EXTERIOR',
    label: '외부 청소',
    items: [
      { key: 'wall', label: '외벽 청소', required: true },
      { key: 'window', label: '외부 창문 청소', required: true },
      { key: 'parking', label: '주차장 청소', required: false },
      { key: 'entrance', label: '건물 입구/로비 청소', required: true },
      { key: 'roof', label: '옥상/지붕 청소', required: false },
    ],
  },
};

/** 특정 청소 유형의 체크리스트 템플릿 반환 */
export function getChecklistTemplate(
  cleaningType: string,
): ChecklistTemplate | null {
  return CLEANING_CHECKLISTS[cleaningType] ?? null;
}

/** 모든 체크리스트 템플릿 반환 */
export function getAllChecklistTemplates(): ChecklistTemplate[] {
  return Object.values(CLEANING_CHECKLISTS);
}
