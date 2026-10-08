import { ILogger } from '../../domain/ports/ILogger.js';
import { IIdGenerator } from '../../domain/ports/IIdGenerator.js';

export interface EmailDispatchOptions {
  readonly toAddress: string;
  readonly subject: string;
  readonly body: string;
}

export interface EmailDispatchResult {
  readonly messageId: string;
  readonly status: 'QUEUED';
}

export class MockEmailService {
  constructor(
    private readonly logger: ILogger,
    private readonly idGenerator: IIdGenerator,
    private readonly simulateFailure: boolean = false,
  ) {}

  public async sendMail(options: EmailDispatchOptions): Promise<EmailDispatchResult> {
    if (this.simulateFailure) {
      throw new Error(`SMTP connection refused to host mail.provider.internal for ${options.toAddress}`);
    }

    const messageId = `msg-${this.idGenerator.generate()}`;
    this.logger.info('[MockEmailService] Email dispatched', {
      messageId,
      to: options.toAddress,
      subject: options.subject,
      bodyPreview: options.body.slice(0, 50),
    });

    return { messageId, status: 'QUEUED' };
  }
}
