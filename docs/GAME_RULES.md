# GnarPuzzle 2.0 - Spelregler

## 🎯 Grundkoncept
GnarPuzzle är ett multiplayer ordspel som kombinerar ordbildning med strategisk bokstavsplacering.

## 👥 Antal spelare
- **2-6 spelare** (fast max för bättre spelupplevelse)
- **Publika rum**: Max 6 spelare oavsett grid-storlek
- **Privata rum**: Konfigurerbart max-antal (upp till 6)

## 🎮 Spelupplägg

### Fas 1: Bokstavsval (Turnbaserat)
1. **Turordning**: Spelarna väljer bokstav i tur och ordning
2. **Timer**: Varje spelare får **10 sekunder** att välja bokstav
3. **Timeout**: Om tiden går ut → automatiskt nästa spelares tur
4. **Bokstavskälla**: Alla svenska bokstäver tillgängliga varje gång (full pool)

### Fas 2: Bokstavsplacering (Simultant)
1. **Timer**: Alla spelare får **15 sekunder** att placera sin bokstav
2. **Placering**: Dra & släpp bokstaven på valfri tom ruta
3. **Timeout-regler**:
   - Inte placerad: Automatisk placering på första tomma ruta
   - Placerad men inte bekräftad: Placeras där den ligger
4. **Bekräftelse**: "OK"-knapp för att slutföra placering

## 🏁 Spelslut
- **Villkor**: När alla rutor på spelplanen är fyllda
- **Ingen elimination**: Alla spelar till slutet

## 🏆 Poängsystem

### Grundpoäng
- **1 poäng per bokstav** som ingår i giltiga ord
- **Horisontella OCH vertikala** ord räknas
- **En bokstav per rad/kolumn**: Samma bokstav kan bara användas i ETT ord per rad/kolumn

### Exempel på grundpoäng:
```
R Ö S T Å (översta raden)
↓
```
- **"RÖS"** = 3 poäng
- **"TÅ"** = 2 poäng  
- **INTE "RÖST" + "STÅ"** (samma bokstav används dubbelt)

### Helradsbonus
- **+2 extrapoäng** om hela raden/kolumnen bildar ETT sammanhängande ord
- **Exempel**: "RÖSTA" på 5×5 = 5 (grundpoäng) + 2 (bonus) = **7 poäng**

### Minimumordlängd
- **2+ bokstäver** = giltigt ord
- Exempel: "AT", "ÄR", "VI" räknas som giltiga ord

## 🎲 Tekniska specifikationer

### Grid-storlekar
- **Publika rum**: 3 fördefinierade alternativ
  - 4×4 (snabbt spel, ~16 rundor)
  - 5×5 (medellångt spel, ~25 rundor)  
  - 6×6 (långt spel, ~36 rundor)
- **Privata rum**: Konfigurerbart grid (3×3 till 8×8)
- **Mobil-optimering**: Alla storlekar responsiva

### Timer-värden
- **Bokstavsval**: 10 sekunder (fast värde)
- **Bokstavsplacering**: 15 sekunder (fast värde)
- **Publika rum**: Fasta timer-värden
- **Privata rum**: Konfigurerbar tid (5-30s range)

### Bokstavsfördelning
- **Alla svenska bokstäver** tillgängliga varje val
- **Ingen begränsning**: Samma bokstav kan väljas flera gånger
- **Alfabetet**: A-Ö inkl. Å, Ä, Ö

## 🏠 Rumtyper

### Publika rum
- **Fördefinierade inställningar**: 
  - 4×4 Grid, Max 6 spelare, 10s/15s timers
  - 5×5 Grid, Max 6 spelare, 10s/15s timers  
  - 6×6 Grid, Max 6 spelare, 10s/15s timers
- **Ingen konfiguration**: Join & play direkt
- **Alltid öppna**: Inga lösenord

### Privata rum
- **Konfigurerbart**:
  - Grid-storlek (3×3 till 8×8)
  - Max antal spelare (2-6)
  - Timer-värden (5-30s för vardera fas)
  - Lösenordsskydd (valfritt)
- **Room creator**: Bestämmer alla inställningar
- **Inbjudningar**: Via room code + eventuellt lösenord

## 🤔 Öppna frågor för implementation

1. **Ordvalidering**: 
   - ~~Vilken ordlista? SAOL?~~ **→ SAOL API om tillgängligt, annars svensk ordlista-fil**
   - ~~Minimumordlängd: 2 eller 3 bokstäver?~~ **→ 2 bokstäver**

2. ~~**Bokstavspool**:~~ **→ Alla svenska bokstäver alltid tillgängliga**
   - ~~Samma som Scrabble eller egen fördelning?~~
   - ~~Hur många av varje bokstav?~~

3. ~~**Timer-värden**:~~ **→ 10s val, 15s placering (konfigurerbart i privata rum)**
   - ~~15s för både val och placering?~~
   - ~~Olika tider för mobil vs desktop?~~

4. **Specialregler**:
   - Ska det finnas specialrutor (dubbel bokstav, etc)?
   - Power-ups eller bara ren ordbildning?

5. **Tie-breaker**:
   - Om flera spelare har samma poäng?
   - Flest helrader? Kortast speltid?

## 🔧 Implementation Priority

### Must-have (MVP):
- [x] Turnbaserat bokstavsval med timer
- [x] Simultant bokstavsplacering med timer
- [x] Grundläggande poängsystem (1p/bokstav)
- [x] Spelslut vid fylld plan
- [ ] Ordvalidering (svenska ord)
- [ ] Helradsbonus (+2p)

### Nice-to-have:
- [ ] Bokstavspoäng (som Scrabble)
- [ ] Specialrutor
- [ ] Statistik (genomsnittlig speltid, etc)
- [ ] Replay-funktionalitet

---

*Uppdaterad: {{ current_date }}*
*Status: Regelspecifikation för implementation*