export const NOTIFICATION_EVENTS = {
  ESTIMATE_SUBMITTED: 'notification.estimate.submitted',
  ESTIMATE_ACCEPTED: 'notification.estimate.accepted',
  ESTIMATE_REJECTED: 'notification.estimate.rejected',
  NEW_ESTIMATE_REQUEST: 'notification.estimate.newRequest',
  NEW_MESSAGE_FIRST_REPLY: 'notification.message.firstReply',
  NEW_REVIEW: 'notification.review.new',
  SUBSCRIPTION_CREATED: 'notification.subscription.created',
  SUBSCRIPTION_EXPIRING: 'notification.subscription.expiring',
  SUBSCRIPTION_EXPIRED: 'notification.subscription.expired',
  MATCHING_COMPLETED: 'notification.matching.completed',
  MATCHING_CANCELLED: 'notification.matching.cancelled',
  COMPLETION_REPORTED: 'notification.matching.completionReported',
  COMPANY_WARNING: 'notification.company.warning',
  COMPANY_SUSPENDED: 'notification.company.suspended',
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
