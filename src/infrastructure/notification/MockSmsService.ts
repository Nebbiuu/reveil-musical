import { ILogger } from '../../domain/ports/ILogger.js';
import { IIdGenerator } from '../../domain/ports/IIdGenerator.js';

export interface SmsDeliveryReport {
  readonly deliveryReportId: string;
  readonly sent: boolean;
}

export class MockSmsService {
  constructor(
    private readonly logger: ILogger,
    private readonly idGenerator: IIdGenerator,
    private readonly simulateFailure: boolean = false,
  ) {}

  public async dispatchText(phoneNumber: string, textPayload: string): Promise<SmsDeliveryReport> {
    if (this.simulateFailure) {
      throw new Error(`SMS gateway timeout for phone number: ${phoneNumber}`);
    }

    const deliveryReportId = `sms-${this.idGenerator.generate()}`;
    this.logger.info('[MockSmsService] SMS dispatched', {
      deliveryReportId,
      phone: phoneNumber,
      chars: textPayload.length,
      text: textPayload,
    });

    return { deliveryReportId, sent: true };
  }
}
