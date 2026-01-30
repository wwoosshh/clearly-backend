export const NOTIFICATION_EVENTS = {
  ESTIMATE_SUBMITTED: 'notification.estimate.submitted',
  ESTIMATE_ACCEPTED: 'notification.estimate.accepted',
  ESTIMATE_REJECTED: 'notification.estimate.rejected',
  NEW_ESTIMATE_REQUEST: 'notification.estimate.newRequest',
  NEW_MESSAGE_FIRST_REPLY: 'notification.message.firstReply',
  NEW_REVIEW: 'notification.review.new',
  POINT_CHANGE: 'notification.point.change',
} as const;

export class NotificationEvent {
  constructor(
    public readonly userId: string,
    public readonly type: string,
    public readonly title: string,
    public readonly content: string,
    public readonly data?: Record<string, any>,
  ) {}
}

export class BulkNotificationEvent {
  constructor(
    public readonly userIds: string[],
    public readonly type: string,
    public readonly title: string,
    public readonly content: string,
    public readonly data?: Record<string, any>,
  ) {}
}
