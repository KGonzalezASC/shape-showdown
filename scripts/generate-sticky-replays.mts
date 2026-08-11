const forwardedArgs = process.argv.slice(2);
process.argv.splice(2, process.argv.length - 2, ...forwardedArgs, '--powerup', 'sticky');
await import('./generate-bomber-replays.mts');
