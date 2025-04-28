// check_tcdd.js

const { chromium } = require('playwright');
const { Command } = require('commander');
const program = new Command();

// --- Station Mapping (Loaded from JSON in the same directory) ---
const stationMap = require('./stations.json'); // Load from ./stations.json

// --- End Station Mapping ---


async function run(departureSelect, arrivalSelect, targetDateStr) {
  console.log(`---`);
  console.log(`Kalkış İstasyonu: ${departureSelect}`);
  console.log(`Varış İstasyonu:   ${arrivalSelect}`);
  console.log(`Hedef Tarih:      ${targetDateStr}`);
  console.log(`---`);

  // --- Parse Target Date --- 
  let targetDate, targetYear, targetMonth, targetDay;
  try {
      // Basic validation and parsing
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
          throw new Error('Geçersiz tarih formatı. YYYY-MM-DD bekleniyor.');
      }
      targetDate = new Date(targetDateStr + 'T00:00:00'); // Add time to avoid timezone issues
      if (isNaN(targetDate.getTime())) {
          throw new Error('Geçersiz tarih değeri.');
      }
      targetYear = targetDate.getFullYear();
      targetMonth = targetDate.getMonth(); // 0-11
      targetDay = targetDate.getDate(); // 1-31
      console.log(` (Ayrıştırıldı: Yıl=${targetYear}, Ay=${targetMonth + 1}, Gün=${targetDay})`);
  } catch(e) {
      console.error(`❌ Hedef tarih işlenemedi: ${e.message}`);
      return;
  }
  // --- End Parse Target Date ---

  // --- Lookup Search Terms ---
  const departureSearch = stationMap[departureSelect];
  const arrivalSearch = stationMap[arrivalSelect];

  if (!departureSearch) {
    console.error(`❌ Kalkış istasyonu '${departureSelect}' için arama metni stationMap'te bulunamadı. Lütfen scripti güncelleyin.`);
    return; // Stop execution
  }
  if (!arrivalSearch) {
    console.error(`❌ Varış istasyonu '${arrivalSelect}' için arama metni stationMap'te bulunamadı. Lütfen scripti güncelleyin.`);
    return; // Stop execution
  }
  console.log(` (Arama için kullanılacak: Kalkış='${departureSearch}', Varış='${arrivalSearch}')`);
  // ---

  // For debugging: headless: false. For actual runs: headless: true
  const browser = await chromium.launch({ headless: true }); // slowMo optional for watching
  const context = await browser.newContext();
  const page = await context.newPage();

  try { // Wrap the whole process in try/finally for robust browser closing
    await page.goto('https://ebilet.tcddtasimacilik.gov.tr/');

    // Kalkış
    console.log('Kalkış istasyonu seçiliyor...');
    const fromInput = page.getByRole('textbox', { name: 'fromTrainInput' });
    await fromInput.click();
    await fromInput.fill(departureSearch); // Use the looked-up search term
    try {
      // Locate the button using the EXACT selection text provided via CLI
      const departureButton = page.locator(`button.station:has(span.textLocation:text-is("${departureSelect}"))`);
      await departureButton.first().click();
      console.log(`  -> '${departureSelect}' seçildi.`);
    } catch (e) {
      console.error(`❌ Kalkış istasyonu '${departureSelect}' dropdown'dan seçilemedi. Web sitesi yapısı değişmiş olabilir veya arama sonucu çıkmamış olabilir. Hata:`, e);
      await page.screenshot({ path: './error_departure_selection.png' });
      return; // Stop execution
    }

    // Varış
    console.log('Varış istasyonu seçiliyor...');
    const toInput = page.getByRole('textbox', { name: 'toTrainInput' });
    await toInput.click();
    await toInput.fill(arrivalSearch); // Use the looked-up search term
    try {
      // Locate the button using the EXACT selection text provided via CLI
      const arrivalButton = page.locator(`button.station:has(span.textLocation:text-is("${arrivalSelect}"))`);
      await arrivalButton.first().click();
      console.log(`  -> '${arrivalSelect}' seçildi.`);
    } catch (e) {
      console.error(`❌ Varış istasyonu '${arrivalSelect}' dropdown'dan seçilemedi. Web sitesi yapısı değişmiş olabilir veya arama sonucu çıkmamış olabilir. Hata:`, e);
      await page.screenshot({ path: './error_arrival_selection.png' });
      return; // Stop execution
    }

    // Tarih
    console.log(`Tarih seçiliyor: ${targetDateStr}...`);
    try {
      await page.locator('.datePickerInput').first().click();
      console.log('  -> Takvim açıldı.');

      // --- Direct Pane Selection Logic ---
      const today = new Date();
      const currentMonth = today.getMonth(); // 0-11
      const currentYear = today.getFullYear();

      let targetPaneSelector;
      if (targetYear === currentYear && targetMonth === currentMonth) {
          console.log(`  -> Hedef tarih (${targetDateStr}) bu ay içinde. Sol takvim hedefleniyor.`);
          targetPaneSelector = 'div.drp-calendar.left';
      } else {
          // Assume target date is in the next month shown on the right
          console.log(`  -> Hedef tarih (${targetDateStr}) bir sonraki ayda. Sağ takvim hedefleniyor.`);
          targetPaneSelector = 'div.drp-calendar.right';
      }
      // --- End Direct Pane Selection Logic ---

      // Click the target day using the full data-date attribute within the chosen pane
      console.log(`  -> Gün ${targetDay} (${targetDateStr}) ${targetPaneSelector} içinde tıklanıyor...`);
      const daySelector = `${targetPaneSelector} table tbody td[data-date="${targetDateStr}"]:not(.disabled):not(.off)`;
      const dayLocator = page.locator(daySelector);

      // Check if the element exists before trying to click
      if (await dayLocator.count() === 0) {
           throw new Error(`Hedef gün (${targetDateStr}) beklenen takvim bölmesinde (${targetPaneSelector}) bulunamadı veya tıklanabilir değil.`);
      }

      // Use dispatchEvent for clicking
      await dayLocator.first().dispatchEvent('click');
      console.log(`  -> Tarih ${targetDateStr} seçildi.`);

    } catch (e) {
      console.error(`❌ Tarih seçilemedi (${targetDateStr}). Hata:`, e);
      await page.screenshot({ path: './error_date_selection.png' });
      await page.keyboard.press('Escape').catch(() => {}); // Attempt to close calendar
      return; // Stop execution
    }

    // Sefer ara
    console.log('Seferler aranıyor...');
    await page.getByRole('button', { name: 'Sefer Ara' }).click();

    try {
      // Wait for the first trip card container to appear
      await page.locator('#gidis1').waitFor({ timeout: 30000, state: 'visible' });
      console.log('Sefer listesi yüklendi.');
    } catch (e) {
      console.error('❌ Sefer listesi yüklenemedi veya zaman aşımı. Rota/tarih için sefer olmayabilir.', e);
      await page.screenshot({ path: './error_trip_list_load.png' });
      return; // Stop execution
    }

    // --- Combined Time and Seat Check Logic ---
    console.log('-'.repeat(30));
    console.log('Sefer Saatleri ve Boş Koltuk Sayıları Kontrol Ediliyor');
    console.log('(Tekerlekli Sandalye hariç)');
    console.log('-'.repeat(30));

    const results = []; // Array to store { time, details }

    // Loop through potential trip cards dynamically
    let i = 0;
    while (true) {
        const seferCardSelector = `#gidis${i}`;
        const seferCard = page.locator(seferCardSelector);
        if (await seferCard.count() === 0) {
            console.log(`\nℹ️ Sefer kartı ${seferCardSelector} bulunamadı, kontrol sonlandırılıyor.`);
            break; // Exit loop if card doesn't exist
        }

        // Extract departure time safely
        const departureTime = (await seferCard.locator('div.locationTime span.textDepartureArea time').textContent({ timeout: 5000 }).catch(() => null))?.trim();

        if (!departureTime) {
             console.warn(`\n⚠️ ${seferCardSelector}: Kalkış saati alınamadı, bu sefer atlanıyor.`);
             i++;
             continue; // Skip to next card if time is missing
        }

        console.log(`\n--- ${departureTime} Seferi (#${i}) Kontrol Ediliyor ---`);

        let seatDetails = {}; // Object to store detailed counts { "Wagon Name": count }

        try {
            const collapseElement = seferCard.locator('div.collapse');
            // Target potential wagon buttons more broadly within the collapse div
            // This selector might need adjustment based on actual site structure for ALL buttons
            const allWagonButtons = collapseElement.locator('button.seciniz, button:has(span.wagonDescription), button:has(span.text-left)'); 
            const buttonCount = await allWagonButtons.count();

            if (buttonCount > 0) {
                console.log(`  🔍 ${buttonCount} potansiyel vagon butonu bulundu, işleniyor...`);
                for (let j = 0; j < buttonCount; j++) {
                    const button = allWagonButtons.nth(j);
                    let wagonName = 'Bilinmeyen Tip';
                    let count = 0; // Default to 0 seats

                    // Try to extract wagon name (robustly)
                    try {
                       // Prioritize the specific span if possible, fallback to broader text
                       const nameSpan = button.locator("xpath=./div/div/span[contains(@class, 'text-left')]").first();
                       if (await nameSpan.count() > 0) {
                           wagonName = (await nameSpan.textContent({ timeout: 1500 }))?.trim() || 'Bilinmeyen Tip';
                       } else {
                           // Fallback: get button's text content if span not found (might be less precise)
                           const buttonText = (await button.textContent({ timeout: 1500 }))?.trim();
                           // Basic cleaning if needed - this is speculative
                           wagonName = buttonText ? buttonText.split('\n')[0].trim() : 'Bilinmeyen Tip'; 
                       }
                    } catch (nameError) {
                         console.warn(`      ⚠️ Vagon adı alınamadı (Buton #${j}): ${nameError.message}`);
                    }
                    
                    // If name extraction failed badly, skip
                    if (wagonName === 'Bilinmeyen Tip' || !wagonName) {
                         console.warn(`      ⚠️ Geçersiz vagon adı, buton atlanıyor.`);
                         continue;
                    }

                    // Try to extract seat count
                    try {
                        const seatSpan = button.locator('span.emptySeat');
                        if (await seatSpan.count() > 0) {
                             const seatText = (await seatSpan.textContent({ timeout: 1500 }).catch(() => '(?)'))?.trim() || '(?)';
                             const match = seatText.match(/\((\d+)\)/);
                             count = match ? parseInt(match[1]) : 0; // Default to 0 if parsing fails
                        } else {
                            // No emptySeat span found, assume 0 available (likely 'DOLU')
                            count = 0;
                        }
                    } catch (countError) {
                         console.warn(`      ⚠️ Koltuk sayısı alınamadı (${wagonName}): ${countError.message}`);
                         count = 0; // Default to 0 on error
                    }

                    console.log(`    -> Bulunan Tip: "${wagonName}", Mevcut Koltuk: ${count}`);
                    // Store the count for this type, even if 0
                    seatDetails[wagonName] = count; 
                }
            } else {
                console.log('  ⚠️ Bu sefer için vagon/koltuk tipi butonu bulunamadı.');
            }

        } catch (error) {
            console.error(`⚠️ ${departureTime} Seferi (#${i}) vagonları işlenirken bir hata oluştu:`, error);
            seatDetails = {}; // Clear details on error for this time slot
        }

        console.log(`  -> ${departureTime} Seferi İçin Detaylar:`, seatDetails);
        // Store time and details (totalSeats is removed as details contain counts)
        results.push({ time: departureTime, details: seatDetails });

        i++; // Increment for next card
    } // End of dynamic loop through trips

    // --- Final Output --- 
    console.log('-'.repeat(30));
    // Output the entire results array as a JSON string, prefixed
    console.log('SEAT_DATA_JSON:' + JSON.stringify(results));
    console.log('-'.repeat(30));

  } catch (globalError) {
      console.error("❌ Script sırasında genel bir hata oluştu:", globalError);
      await page.screenshot({ path: './error_general_failure.png' });
  } finally {
      console.log("Tarayıcı kapatılıyor...");
      await browser.close();
  }
} // End of run function

// ---- CLI Part ----
// Update CLI options
program
  .option('--nereden <text>', 'Kalkış istasyonu TAM seçim metni (stationMap içinde tanımlı olmalı!)', { required: true })
  .option('--nereye <text>', 'Varış istasyonu TAM seçim metni (stationMap içinde tanımlı olmalı!)', { required: true })
  .option('--tarih <YYYY-MM-DD>', 'Tam hedef tarih (YYYY-MM-DD)', { required: true })
  .parse(process.argv);

const options = program.opts();

// Call run with the updated arguments
run(
  options.nereden,
  options.nereye,
  options.tarih
).catch(err => {
  console.error("Ana çalıştırma fonksiyonunda yakalanamayan hata:", err);
  process.exit(1);
});