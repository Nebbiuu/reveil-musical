/* eslint-disable no-console -- CLI entry point: console output is the purpose of this script */
import { buildApplicationContainerFromEnv } from './composition-root/container.js';
import type { Weather } from './domain/models/Weather.js';
import type { DayOfWeek } from './domain/models/DayOfWeek.js';

/**
 * Demo entry point: `npm run demo -- <userId> <jour> <météo>`
 * Example: npm run demo -- user-alice LUNDI PLUIE
 */
async function main(): Promise<void> {
  const [userId = 'user-alice', day = 'LUNDI', weather = 'SOLEIL'] = process.argv.slice(2);

  const container = buildApplicationContainerFromEnv();

  const result = await container.sendWakeUpUseCase.sendWakeUp(
    userId,
    day as DayOfWeek,
    weather as Weather,
  );

  console.log('\n=== Résultat du réveil ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('\n=== Échec ===');
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});