/**
 * Redis 캐시 TTL 정책 상수
 *
 * 도메인별 TTL 기준:
 * - 실시간성 높음 (채팅/알림): 30~60초
 * - 사용자/인증 데이터: 60~300초
 * - 비즈니스 데이터 (업체/리뷰): 300~600초
 * - 정적 데이터 (배너/FAQ): 1800~7200초
 */
export const CACHE_TTL = {
  /** 채팅방 정보: 30초 */
  CHAT_ROOM: 30,

  /** 알림 미읽음 카운트: 30초 */
  NOTIFICATION_COUNT: 30,

  /** JWT 사용자 검증 캐시: 60초 */
  JWT_USER: 60,

  /** 알림 목록: 60초 */
  NOTIFICATION_LIST: 60,

  /** 업체 프로필 (사용자 관점): 300초 (5분) */
  COMPANY_PROFILE: 300,

  /** 구독 정보: 300초 (5분) */
  SUBSCRIPTION_INFO: 300,

  /** 사용자 프로필: 300초 (5분) */
  USER_PROFILE: 300,

  /** OAuth 상태 코드: 300초 (5분) */
  OAUTH_STATE: 300,

  /** OAuth 임시 코드: 60초 */
  OAUTH_TEMP_CODE: 60,

  /** 업체 상세 정보: 600초 (10분) */
  COMPANY_DETAIL: 600,

  /** 리뷰 목록: 600초 (10분) */
  REVIEW_LIST: 600,

  /** 시스템 설정: 600초 (10분) */
  SYSTEM_SETTINGS: 600,

  /** 배너 목록: 3600초 (1시간) */
  BANNER_LIST: 3600,

  /** 소켓 연결 세션: 3600초 (1시간) */
  SOCKET_SESSION: 3600,

  /** FAQ 목록: 7200초 (2시간) */
  FAQ_LIST: 7200,

  /** 리뷰 도움됨 투표 중복 방지: 2592000초 (30일) */
  REVIEW_VOTE: 60 * 60 * 24 * 30,
} as const;
