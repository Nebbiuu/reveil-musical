import { ILogger } from '../../domain/ports/ILogger.js';
import { IIdGenerator } from '../../domain/ports/IIdGenerator.js';

export interface PushNotificationPayload {
  readonly title: string;
  readonly content: string;
  readonly extra: Record<string, unknown>;
}

export interface PushNotificationResult {
  readonly success: boolean;
  readonly pushId: string;
}

export class MockPushService {
  constructor(
    private readonly logger: ILogger,
    private readonly idGenerator: IIdGenerator,
    private readonly simulateFailure: boolean = false,
  ) {}

  public async pushNotification(
    deviceToken: string,
    messageData: PushNotificationPayload,
  ): Promise<PushNotificationResult> {
    if (this.simulateFailure) {
      throw new Error(`APNS/FCM bad device token or service unavailable for token: ${deviceToken}`);
    }

    const pushId = `push-${this.idGenerator.generate()}`;
    this.logger.info('[MockPushService] Push notification delivered', {
      pushId,
      deviceToken,
      title: messageData.title,
      content: messageData.content,
      extra: messageData.extra,
    });

    return { success: true, pushId };
  }
}
