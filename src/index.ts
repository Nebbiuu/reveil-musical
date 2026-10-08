import { ApplicationContainer, buildApplicationContainerFromEnv } from './composition-root/container.js';
import { DayOfWeek } from './domain/models/DayOfWeek.js';
import { Weather } from './domain/models/Weather.js';
import { WakeUpResult } from './domain/models/WakeUpResult.js';

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/index.js';
export * from './composition-root/container.js';

let defaultContainer: ApplicationContainer | undefined;

function getDefaultContainer(): ApplicationContainer {
  if (!defaultContainer) {
    defaultContainer = buildApplicationContainerFromEnv();
  }
  return defaultContainer;
}

/**
 * Main application entry point: sendWakeUp(userId, dayOfWeek, weather)
 * Validates inputs, resolves music through provider chain, notifies on preferred channel,
 * and handles all fallbacks/degraded modes with zero unhandled exceptions.
 */
export async function sendWakeUp(
  userId: string,
  dayOfWeek: DayOfWeek | string,
  weather: Weather | string,
): Promise<WakeUpResult> {
  const container = getDefaultContainer();
  return container.sendWakeUpUseCase.sendWakeUp(userId, dayOfWeek, weather);
}
