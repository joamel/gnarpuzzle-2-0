import { WordValidationService } from './src/services/WordValidationService';

async function test() {
  const service = WordValidationService.getInstance();
  await service.loadDictionary();
  
  console.log('\n=== Testing ÖSA in dictionary ===');
  console.log('isValidWord("ÖSA"):', service.isValidWord("ÖSA"));
  console.log('isValidWord("ösa"):', service.isValidWord("ösa"));
  console.log('isValidWord("ÖS"):', service.isValidWord("ÖS"));
  console.log('isValidWord("SÄ"):', service.isValidWord("SÄ"));
  console.log('isValidWord("ÖSAÄ"):', service.isValidWord("ÖSAÄ"));
  
  console.log('\n=== Testing partition of "ÖSAÄ" ===');
  const partition = (service as any).findOptimalPartition("ÖSAÄ");
  console.log('Partition result:', JSON.stringify(partition, null, 2));
  
  console.log('\n=== Testing partition of "ÖSA" ===');
  const partition2 = (service as any).findOptimalPartition("ÖSA");
  console.log('Partition result:', JSON.stringify(partition2, null, 2));
  
  console.log('\n=== Testing grid with ÖSAÄ column ===');
  // Create a 4x4 grid with ÖSAÄ in column 2
  const grid = Array.from({ length: 4 }, (_, y) => 
    Array.from({ length: 4 }, (_, x) => ({ letter: null as string | null, x, y }))
  );
  
  // Fill column 2 with Ö-S-A-Ä
  grid[0][2] = { letter: 'Ö', x: 2, y: 0 };
  grid[1][2] = { letter: 'S', x: 2, y: 1 };
  grid[2][2] = { letter: 'A', x: 2, y: 2 };
  grid[3][2] = { letter: 'Ä', x: 2, y: 3 };
  
  const gridScore = service.calculateGridScore(grid);
  console.log('\nGrid score:', JSON.stringify(gridScore, null, 2));
}

test().catch(console.error);
