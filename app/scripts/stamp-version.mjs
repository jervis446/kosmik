// Writes public/version.json before each web build. The app compares it with the version it
// loaded, and offers a refresh when a newer Kosmik has been deployed.
import { writeFileSync } from 'node:fs';

const release = `${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
writeFileSync(new URL('../public/version.json', import.meta.url), JSON.stringify({ release }) + '\n');
console.log(`version ${release}`);
