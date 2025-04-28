const http = require('http');
const express = require('express'); // Import Express

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process'); // To run the check_tcdd.js script
const path = require('path'); // Needed for script path
const util = require('util'); // For promisify
const cron = require('node-cron'); // For scheduling checks

// --- Credentials ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!token || !supabaseUrl || !supabaseKey) {
    console.error("Hata: Lütfen .env dosyasını kontrol edin ve gerekli Telegram ve Supabase bilgilerini ekleyin.");
    process.exit(1);
}

// --- Initialize Clients ---
const bot = new TelegramBot(token);
const app = express();
const PORT = process.env.PORT || 8080;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());
const WEBHOOK_PATH = `/webhook/${token}`; // Using token in path adds a layer of security

app.post(WEBHOOK_PATH, (req, res) => {
    console.log("Received Telegram update via webhook:", JSON.stringify(req.body));
    bot.processUpdate(req.body); // Hand off the update to node-telegram-bot-api
    res.sendStatus(200); // Send OK status back to Telegram immediately
});

// Optional: A root path for health checks or basic info
app.get('/', (req, res) => {
    res.status(200).send('Telegram Bot is running (Webhook Mode)');
});

// --- Start the Express Server ---
app.listen(PORT, () => {
    console.log(`HTTP Server started on port ${PORT}`);
    console.log(`Webhook endpoint ready at ${WEBHOOK_PATH}`);
    // You only need to set the webhook ONCE, usually manually or via a setup script
    // Do NOT set it here on every startup if running on Cloud Run, as the URL might change
    // setWebhook(); // See function below - use this carefully
});


// --- Authentication Helper ---
async function isUserAllowed(chatId) {
    if (!chatId) return false; // Basic check
    const stringChatId = String(chatId); // Ensure it's a string for comparison

    // You might want to cache this result for a short time to avoid hitting the DB on every message
    // For now, we check every time.
    // console.log(`[Auth] Checking access for chat_id: ${stringChatId}`); // Uncomment for debugging

    const { error, count } = await supabase
        .from('allowed_users')
        .select('chat_id', { count: 'exact', head: true }) // Efficiently check existence
        .eq('chat_id', stringChatId);

    if (error) {
        console.error(`[Auth] Supabase error checking allowed_users for ${stringChatId}:`, error);
        // Fail safe: Deny access if there's a DB error
        return false;
    }

    const allowed = count > 0;
    // console.log(`[Auth] Access result for ${stringChatId}: ${allowed}`); // Uncomment for debugging
    return allowed;
}

// --- Station Mapping (Loaded from JSON in the same directory) ---
const stationMap = require('./stations.json'); // Load from ./stations.json
const stationKeys = Object.keys(stationMap); // For presenting options

// --- Constants ---
const SEAT_TYPES = ['Ekonomi', 'Business']; // Add 'Loca', 'Tekerlekli Sandalye' if needed

// --- Helper Functions ---
// Find station keys matching user input (case-insensitive partial match, Turkish locale aware)
function findMatchingStations(inputText) {
    const normalizedInput = inputText.toLocaleLowerCase('tr-TR').trim();
    if (!normalizedInput) return [];

    const matches = stationKeys.filter(key => {
        const stationShortNameLower = stationMap[key]?.toLocaleLowerCase('tr-TR');
        const keyLower = key.toLocaleLowerCase('tr-TR');

        // Check if short name or full key contains the input
        if (stationShortNameLower?.includes(normalizedInput)) return true;
        if (keyLower.includes(normalizedInput)) return true;

        return false;
    });

    // Improve matching: Prioritize matches where the short name *starts* with the input,
    // or where the input is an exact match for the short name.
    matches.sort((a, b) => {
        const shortA = stationMap[a]?.toLocaleLowerCase('tr-TR') || '';
        const shortB = stationMap[b]?.toLocaleLowerCase('tr-TR') || '';

        const aIsExact = shortA === normalizedInput;
        const bIsExact = shortB === normalizedInput;
        const aStartsWith = shortA.startsWith(normalizedInput);
        const bStartsWith = shortB.startsWith(normalizedInput);

        if (aIsExact !== bIsExact) return aIsExact ? -1 : 1; // Exact matches first
        if (aStartsWith !== bStartsWith) return aStartsWith ? -1 : 1; // StartsWith matches next

        // Optional: alphabetical sort as fallback
        return a.localeCompare(b, 'tr-TR');
    });

     // If the top match after sorting is an exact match on the short name, only return that.
     if (matches.length > 0) {
        const topMatchShort = stationMap[matches[0]]?.toLocaleLowerCase('tr-TR');
        if (topMatchShort === normalizedInput) {
            return [matches[0]];
        }
     }

    return matches;
}

async function getUserState(chatId) {
    // TODO: Fetch user state from Supabase 'user_requests' table
    // Example: SELECT * FROM user_requests WHERE chat_id = chatId AND status != 'completed' ORDER BY created_at DESC LIMIT 1;
    console.log(`[getUserState] Fetching state for ${chatId}`);
    // Placeholder: return null;
     const { data, error } = await supabase
        .from('user_requests')
        .select('*')
        .eq('chat_id', String(chatId))
        .neq('status', 'completed') // Ignore completed requests
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error(`[getUserState] Supabase error for ${chatId}:`, error);
        return null;
    }
    if (data && data.length > 0) {
        console.log(`[getUserState] Found state for ${chatId}:`, data[0].status);
        return data[0]; // Return the latest active request object
    }
    console.log(`[getUserState] No active state found for ${chatId}`);
    return null; // No active request found
}

async function updateUserState(chatId, updateData) {
    // TODO: Update user state in Supabase 'user_requests' table
    // Example: UPDATE user_requests SET ... WHERE chat_id = chatId AND status = 'current_status';
    console.log(`[updateUserState] Updating state for ${chatId}:`, updateData);
    // Placeholder: return true;
    const currentState = await getUserState(chatId);
    if (!currentState) {
        console.error(`[updateUserState] Cannot update, no active state found for ${chatId}.`);
        return false;
    }

    const { data, error } = await supabase
        .from('user_requests')
        .update(updateData)
        .eq('chat_id', String(chatId));

    if (error) {
        console.error(`[updateUserState] Supabase error updating request for chat ${chatId} (created at ${currentState?.created_at}):`, error);
        return false;
    }
    console.log(`[updateUserState] Successfully updated state for chat ${chatId} (identified by chat_id)`);
    return true;
}

async function createNewRequest(chatId) {
    console.log(`[createNewRequest] Creating new request for ${chatId}`);
    const { data, error } = await supabase
        .from('user_requests')
        .insert([
            { chat_id: String(chatId), status: 'awaiting_departure' }
        ])
        .select(); // Attempt to return the created record

     if (error) {
        console.error(`[createNewRequest] Supabase error for ${chatId}:`, error);
        return null;
    }
    if (data && data.length > 0) {
        console.log(`[createNewRequest] Successfully created new request for ${chatId}, record data:`, data[0]);
        return data[0];
    }
    console.error(`[createNewRequest] Failed to create or retrieve new request for ${chatId}.`);
    return null;
}

// --- Function to generate calendar keyboard ---
function generateCalendarKeyboard(year, month) {
    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon, ...
    const adjustedFirstDay = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1; // Adjust so Monday is 0

    const keyboard = [];

    // Header: Month Name and Year
    keyboard.push([{ text: `${monthNames[month]} ${year}`, callback_data: 'calendar_ignore' }]);

    // Header: Days of the week (Mo Tu We Th Fr Sa Su)
    keyboard.push(["Pzt", "Sal", "Çrş", "Per", "Cum", "Cmt", "Paz"].map(day => ({ text: day, callback_data: 'calendar_ignore' })));

    let day = 1;
    let week = [];

    // Add empty cells for the days before the 1st of the month
    for (let i = 0; i < adjustedFirstDay; i++) {
        week.push({ text: ' ', callback_data: 'calendar_ignore' });
    }

    // Fill in the days
    while (day <= daysInMonth) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        week.push({ text: String(day), callback_data: `calendar_day:${dateStr}` });

        if (week.length === 7) {
            keyboard.push(week);
            week = [];
        }
        day++;
    }

    // Add empty cells for the remaining days of the last week
    if (week.length > 0) {
        while (week.length < 7) {
            week.push({ text: ' ', callback_data: 'calendar_ignore' });
        }
        keyboard.push(week);
    }

    // Navigation buttons
    const prevMonth = new Date(year, month - 1);
    const nextMonth = new Date(year, month + 1);
    keyboard.push([
        { text: '<', callback_data: `calendar_nav:${prevMonth.getFullYear()}-${prevMonth.getMonth()}` },
        { text: '>', callback_data: `calendar_nav:${nextMonth.getFullYear()}-${nextMonth.getMonth()}` }
    ]);

    return { inline_keyboard: keyboard };
}

// --- End Calendar Function ---

// --- Bot Event Handlers ---

// Handle /start command
bot.onText(/^\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    // --- Authorization Check ---
    if (!(await isUserAllowed(chatId))) {
        console.log(`[Auth] Denied /start access for ${chatId}`);
        bot.sendMessage(chatId, "Üzgünüm, bu botu kullanma yetkiniz yok.");
        return;
    }
    // --- End Authorization Check ---
    console.log(`Received /start from ${chatId}`);

    // Removed getUserState call here, as upsert handles both cases
    let requestRecord;
    let startMessage = "Merhaba! 👋 TCDD bilet uygunluğunu kontrol edelim.\n\nLütfen kalkış istasyonunu yazın (örn: Ankara, Eskişehir, Söğütlüçeşme):";
    let errorMessage = "Üzgünüm, isteğinizi başlatırken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.";

    console.log(`[startHandler] Upserting request state for chat ${chatId}`);
    const { data, error } = await supabase
        .from('user_requests')
        .upsert({
            chat_id: String(chatId), // Primary key
            // Fields to set/reset on insert or update
            status: 'awaiting_departure',
            departure_input: null,
            arrival_input: null,
            mapped_departure: null,
            mapped_arrival: null,
            day: null,
            specific_time: null,
            seat_type: null,
            selected_date: null // Ensure this is reset too
        }, {
            onConflict: 'chat_id' // Specify the column that causes conflict
        })
        .select(); // Return the inserted or updated record

    if (error) {
        console.error(`[startHandler] Supabase upsert error for chat ${chatId}:`, error);
        requestRecord = null;
    } else if (data && data.length > 0) {
         console.log(`[startHandler] Successfully upserted request for chat ${chatId}`);
         requestRecord = data[0];
    } else {
         console.error(`[startHandler] Upsert operation failed to return data for chat ${chatId}.`);
         requestRecord = null;
    }

    // Send appropriate message based on success/failure
    if (requestRecord) {
        bot.sendMessage(chatId, startMessage);
    } else {
        bot.sendMessage(chatId, errorMessage);
    }
});

// Handle /stop command
bot.onText(/^\/stop$/, async (msg) => {
    const chatId = msg.chat.id;
    // --- Authorization Check ---
    if (!(await isUserAllowed(chatId))) {
        console.log(`[Auth] Denied /stop access for ${chatId}`);
        bot.sendMessage(chatId, "Üzgünüm, bu botu kullanma yetkiniz yok.");
        return;
    }
    // --- End Authorization Check ---
    console.log(`Received /stop from ${chatId}`);

    const currentState = await getUserState(chatId);

    if (currentState && currentState.status === 'monitoring') {
        console.log(`Stopping monitoring for chat ${chatId}`);
        const updateSuccess = await updateUserState(chatId, { status: 'cancelled' }); // Use 'cancelled' or a specific 'stopped' status

        if (updateSuccess) {
            bot.sendMessage(chatId, "✅ Aktif tren bileti takibi başarıyla durduruldu.");
        } else {
            bot.sendMessage(chatId, "❌ Takip durdurulurken bir hata oluştu. Lütfen tekrar deneyin.");
        }
    } else if (currentState) {
        // User has an active request but it's not in monitoring state
         bot.sendMessage(chatId, "⚠️ Şu anda aktif bir takip işlemi bulunmuyor (mevcut durum: " + currentState.status + "). Yeni bir takip başlatmak için /start kullanabilirsiniz.");
    } else {
        // No active request found at all
        bot.sendMessage(chatId, "⚠️ Durdurulacak aktif bir takip bulunmuyor. Yeni bir takip başlatmak için /start kullanabilirsiniz.");
    }
});

// Handle incoming messages (main conversation logic)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore commands like /start, /stop here, handled by onText
    if (text && text.startsWith('/')) {
        return;
    }

    // --- Authorization Check for general messages ---
    if (!(await isUserAllowed(chatId))) {
        console.log(`[Auth] Ignored message from unauthorized user ${chatId}`);
        // Silently ignore messages from unauthorized users in the main flow
        return;
    }
    // --- End Authorization Check ---

    console.log(`Received message from ${chatId}: "${text}"`);

    const currentState = await getUserState(chatId);

    if (!currentState) {
        // If user sends message without an active state (e.g., after a restart or error)
        bot.sendMessage(chatId, "Lütfen işleme başlamak için /start komutunu kullanın.");
        return;
    }

    console.log(`Current state for ${chatId}: ${currentState.status}`);

    // --- State Machine ---
    switch (currentState.status) {
        case 'awaiting_departure':
            // Use the new helper function
            await handleStationInput(chatId, text, currentState, 'departure');
            break;

        case 'awaiting_arrival':
             // Use the new helper function
             await handleStationInput(chatId, text, currentState, 'arrival');
            break;

        case 'awaiting_day':
            // Ignore text messages in this state, user should use the calendar
            console.log(`Ignoring text message "${text}" while awaiting day selection.`);
            break;

        case 'processing_request': // Added during calendar selection
        case 'awaiting_time_selection': // Waiting for user to click a time
            // User message received while waiting for script/callback
             bot.sendMessage(chatId, "Şu anda isteğiniz işleniyor veya seçim bekleniyor. Yeni bir arama başlatmak için /start kullanabilirsiniz.");
            break;

        case 'completed':
        case 'cancelled':
             bot.sendMessage(chatId, "Bu istek tamamlandı veya iptal edildi. Yeni bir arama başlatmak için /start kullanabilirsiniz.");
             break;

        default:
            console.log(`Unhandled state: ${currentState.status} for chat ${chatId}`);
            bot.sendMessage(chatId, "Beklenmedik bir durum oluştu. Lütfen /start ile yeniden başlayın.");
            await updateUserState(chatId, { status: 'cancelled' }); // Mark as cancelled to prevent loop
            break;
    }
});

// Handle callback queries (from inline keyboards like station choices, times, calendar, seats)
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data; // Data sent from the button

    // --- Authorization Check ---
    if (!(await isUserAllowed(chatId))) {
        console.log(`[Auth] Denied callback access for ${chatId}`);
        try {
             // Answer the callback to dismiss the loading state on the button, and show an alert
             await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Yetkiniz yok.", show_alert: true });
        } catch(e){
             console.warn(`[Auth] Failed to answer callback for denied user ${chatId}:`, e.message); 
        }
        return;
    }
    // --- End Authorization Check ---

    console.log(`Received callback_query from ${chatId}: ${data}`);
    bot.answerCallbackQuery(callbackQuery.id); // Acknowledge the button press for authorized users

    const currentState = await getUserState(chatId);

    if (!currentState) {
        bot.sendMessage(chatId, "İşlem durumu bulunamadı. Lütfen /start ile yeniden başlayın.");
        return;
    }

    console.log(`Current state for callback ${chatId}: ${currentState.status}`);

    // --- Callback Handling Logic ---
    try { // Wrap handler in try/catch for safety
        // --- Add/Ensure Station Selection Handlers --- 
        if (currentState.status === 'awaiting_departure_choice' && data.startsWith('station_select_dep:')) {
            const selectedStationKey = data.substring('station_select_dep:'.length);
            console.log(`Departure station selected via callback: ${selectedStationKey}`);
            bot.editMessageText(`Kalkış istasyonu '${selectedStationKey}' olarak seçildi.\nŞimdi varış istasyonunu yazın:`, { 
                chat_id: chatId, 
                message_id: msg.message_id,
                reply_markup: { inline_keyboard: [] } // Remove keyboard
            });
            await updateUserState(chatId, {
                mapped_departure: selectedStationKey,
                status: 'awaiting_arrival'
            });
        } else if (currentState.status === 'awaiting_arrival_choice' && data.startsWith('station_select_arr:')) {
            const selectedStationKey = data.substring('station_select_arr:'.length);
            console.log(`Arrival station selected via callback: ${selectedStationKey}`);
            const today = new Date();
            const initialCalendar = generateCalendarKeyboard(today.getFullYear(), today.getMonth());
            bot.editMessageText(`Varış istasyonu '${selectedStationKey}' olarak seçildi.\nLütfen seferin gerçekleşeceği günü seçin:`, {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: initialCalendar
            });
            await updateUserState(chatId, {
                mapped_arrival: selectedStationKey,
                status: 'awaiting_day'
            });
        // --- End Station Selection Handlers --- 
          
        // --- Multi-Time Toggle Handler --- 
        } else if (currentState.status === 'awaiting_multi_time_selection' && data.startsWith('multi_time_toggle:')) {
            const timeToToggle = data.substring('multi_time_toggle:'.length);
            console.log(`Toggling time selection: ${timeToToggle}`);

            const requestData = await getUserState(chatId);
            if (!requestData || !requestData.last_check_results || !requestData.selected_times) {
                console.error(`[multi_time_toggle:callback] Invalid state for chat ${chatId}`);
                return; // Or send error message
            }

            let currentSelectedTimes = Array.isArray(requestData.selected_times) ? [...requestData.selected_times] : [];
            const timeIndex = currentSelectedTimes.indexOf(timeToToggle);

            if (timeIndex > -1) {
                // Time is selected, remove it
                currentSelectedTimes.splice(timeIndex, 1);
            } else {
                // Time is not selected, add it
                currentSelectedTimes.push(timeToToggle);
                currentSelectedTimes.sort(); // Keep the list sorted for consistency
            }

            // Update the state in DB first
            const updateSuccess = await updateUserState(chatId, { selected_times: currentSelectedTimes });

            if (updateSuccess) {
                 // Regenerate keyboard with checkmarks (3 columns)
                 const timeButtons = requestData.last_check_results.map(result => {
                     const isSelected = currentSelectedTimes.includes(result.time);
                     const buttonText = isSelected ? `✅ ${result.time}` : result.time;
                     return { text: buttonText, callback_data: `multi_time_toggle:${result.time}` };
                 });
                 
                 const timeKeyboardRows = [];
                 for (let i = 0; i < timeButtons.length; i += 3) {
                     timeKeyboardRows.push(timeButtons.slice(i, i + 3)); // Create rows of 3 buttons
                 }
                 // Add the 'Done' button as a separate row at the end
                 timeKeyboardRows.push([{ text: "Seçimi Bitir ✅", callback_data: 'multi_time_done' }]);

                 // Edit the keyboard
                 try {
                     await bot.editMessageReplyMarkup({ inline_keyboard: timeKeyboardRows }, { chat_id: chatId, message_id: msg.message_id });
                 } catch (editError) {
                      // Ignore ETELEGRAM: 400 Bad Request: message is not modified if keyboard is the same
                      if (!editError.message?.includes('message is not modified')) {
                          console.error(`[multi_time_toggle:callback] Error editing keyboard for chat ${chatId}:`, editError);
                      }
                 }
            } else {
                 console.error(`[multi_time_toggle:callback] Failed to update selected_times in DB for chat ${chatId}`);
                 // Maybe notify user?
            }

        // --- Multi-Time Done Handler --- 
        } else if (currentState.status === 'awaiting_multi_time_selection' && data === 'multi_time_done') {
            console.log('Multi-time selection done.');

            const requestData = await getUserState(chatId);
             if (!requestData || !requestData.last_check_results || !requestData.selected_times) {
                console.error(`[multi_time_done:callback] Invalid state for chat ${chatId}`);
                return; // Or send error message
            }

            const selectedTimes = requestData.selected_times;
            const allResults = requestData.last_check_results;

            if (!selectedTimes || selectedTimes.length === 0) {
                bot.sendMessage(chatId, "Lütfen en az bir sefer saati seçin veya işlemi iptal etmek için /start komutunu kullanın.", { reply_to_message_id: msg.message_id });
                return; // Stay in the same state
            }

            // Filter results to only those the user selected
            const selectedResults = allResults.filter(r => selectedTimes.includes(r.time));

            // Determine unique seat types available across the SELECTED time slots
            const availableSeatTypesInSelection = new Set();
            selectedResults.forEach(result => {
                 if (result.details) {
                     Object.keys(result.details).forEach(wagonName => {
                         // Exclude wheelchair and only add if it exists in the selected times
                         if (!wagonName.toLowerCase().includes('tekerlekli sandalye')) {
                             availableSeatTypesInSelection.add(wagonName);
                         }
                     });
                 }
            });

            const selectableSeatTypes = Array.from(availableSeatTypesInSelection);
            let seatTypesKeyboard = [];

            if (selectableSeatTypes.length > 0) {
                 seatTypesKeyboard = selectableSeatTypes.sort().map(typeName => (
                     [{ text: typeName, callback_data: `seat_select:${typeName}` }]
                 ));
                await bot.editMessageText(`Seçilen Saatler: ${selectedTimes.join(', ')}\n\nŞimdi takip etmek istediğiniz koltuk tipini seçin:`, {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: { inline_keyboard: seatTypesKeyboard }
                });
                await updateUserState(chatId, { status: 'awaiting_seat_type_selection' });
            } else {
                 // Should be rare if script ran ok, but handle it
                 await bot.editMessageText(`Seçilen Saatler: ${selectedTimes.join(', ')}\n\nBu seferler için seçilebilecek koltuk tipi bulunamadı (Tekerlekli Sandalye hariç).`, {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: { inline_keyboard: [] }
                 });
                 await updateUserState(chatId, { status: 'completed', last_check_results: null, selected_times: null });
            }

        // --- Seat Type Selection Handler --- 
        } else if (currentState.status === 'awaiting_seat_type_selection' && data.startsWith('seat_select:')) {
            // --- Modify seat_select handler to use selected_times ---
            const selectedSeatType = data.substring('seat_select:'.length);
            console.log(`Seat type selected: ${selectedSeatType}`);

            const requestData = await getUserState(chatId);
            // Need selected_times here now instead of specific_time
            if (!requestData || !requestData.selected_times || requestData.selected_times.length === 0) {
                 console.error(`[seat_select:callback] Could not retrieve state or selected_times for chat ${chatId}`);
                 await bot.editMessageText("İşlem durumu veya saat bilgisi alınırken bir hata oluştu. Lütfen /start ile tekrar deneyin.", {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: { inline_keyboard: [] }
                 }).catch(err => console.error("Failed to edit message on seat_select error:", err));
                 return; 
            }

            // Send final confirmation message
            await bot.editMessageText(`Seçiminiz Kaydedildi:\n- Tarih: ${requestData.selected_date}\n- Saatler: ${requestData.selected_times.join(', ')}\n- Kalkış: ${requestData.mapped_departure}\n- Varış: ${requestData.mapped_arrival}\n- Koltuk Tipi: ${selectedSeatType}\n\nBu kriterlere uygun koltuk bulunduğunda haber verilecek.`, {
                 chat_id: chatId,
                 message_id: msg.message_id,
                 reply_markup: { inline_keyboard: [] }
            });

            // Update state to monitoring, keeping selected_times
            await updateUserState(chatId, {
                seat_type: selectedSeatType, 
                status: 'monitoring', 
                last_check_results: null // Clear check results, but keep selected_times
            });
        // --- Calendar Navigation Handler --- 
        } else if (data.startsWith('calendar_nav:')) {
            // Handle calendar navigation
            if (currentState.status !== 'awaiting_day') return; // Ignore if not in correct state
            const [year, month] = data.substring('calendar_nav:'.length).split('-').map(Number);
            const newCalendar = generateCalendarKeyboard(year, month);
            bot.editMessageReplyMarkup(newCalendar, { chat_id: chatId, message_id: msg.message_id });

        // --- Calendar Day Handler --- 
        } else if (data.startsWith('calendar_day:')) {
            // Handle day selection
            if (currentState.status !== 'awaiting_day') return; // Ignore if not in correct state
            const selectedDate = data.substring('calendar_day:'.length);
            console.log(`Day selected: ${selectedDate}`);

            // Update state immediately to prevent double-clicks and show feedback
            await bot.editMessageText(`Gün ${selectedDate} olarak seçildi.
Seferler ve koltuk sayıları kontrol ediliyor... Bu işlem biraz sürebilir, lütfen bekleyin. ⏳`, {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: { inline_keyboard: [] } // Remove calendar
            });
            await updateUserState(chatId, {
                selected_date: selectedDate,
                status: 'processing_request' // New intermediate status
            });

            // Fetch the latest state data needed for the script
            const requestData = await getUserState(chatId);
            if (!requestData || !requestData.mapped_departure || !requestData.mapped_arrival || !requestData.selected_date) {
                console.error(`[calendar_day:exec] Missing required data for chat ${chatId}`);
                bot.sendMessage(chatId, "İşlem sırasında bir hata oluştu (eksik bilgi). Lütfen /start ile tekrar deneyin.");
                await updateUserState(chatId, { status: 'cancelled' });
                return;
            }

            // Execute the script
            const scriptPath = path.join(__dirname, 'check_tcdd.js');
            const command = `node "${scriptPath}" --nereden="${requestData.mapped_departure}" --nereye="${requestData.mapped_arrival}" --tarih="${requestData.selected_date}"`;
            console.log(`[Exec] Running command: ${command}`);

            exec(command, { timeout: 90000 }, async (error, stdout, stderr) => { // Increased timeout
                let updatePayload = {}; // To store final status update
                try {
                    if (error) {
                        console.error(`[Exec Error] for chat ${chatId}:`, error);
                        console.error(`[Exec Stderr] for chat ${chatId}:`, stderr);
                        await bot.editMessageText(`Sefer bilgileri alınırken bir hata oluştu: ${error.message}. Lütfen daha sonra tekrar deneyin veya /start ile yeniden başlayın.`, {
                             chat_id: chatId,
                             message_id: msg.message_id,
                             reply_markup: { inline_keyboard: [] }
                        });
                        updatePayload = { status: 'cancelled' };
                        return; // Exit callback early
                    }

                    console.log(`[Exec Stdout] for chat ${chatId}:\n${stdout}`);
                    if (stderr) {
                        console.warn(`[Exec Stderr] for chat ${chatId} (non-fatal):\n${stderr}`);
                    }

                    // Parse the new JSON output
                    const lines = stdout.split(/\r?\n/);
                    const jsonLine = lines.find(line => line.startsWith('SEAT_DATA_JSON:'));
                    let parsedResults = [];
                    if (jsonLine) {
                        try {
                            const jsonString = jsonLine.substring('SEAT_DATA_JSON:'.length);
                            parsedResults = JSON.parse(jsonString);
                        } catch (parseError) {
                            console.error(`[JSON Parse Error] for chat ${chatId}:`, parseError);
                            await bot.editMessageText("Sefer bilgileri alınamadı (veri işlenemedi). Lütfen /start ile tekrar deneyin.", {
                                 chat_id: chatId,
                                 message_id: msg.message_id,
                                 reply_markup: { inline_keyboard: [] }
                            });
                            updatePayload = { status: 'cancelled' };
                            return; // Exit callback early
                        }
                    }

                    // Check if we got any time slots at all
                    if (parsedResults.length > 0) {
                        console.log(`[Parsed Results] for chat ${chatId}:`, parsedResults);

                        // Create inline keyboard for MULTI time selection (3 columns)
                        const timeButtons = parsedResults.map(result => {
                            // Button shows time, callback toggles selection
                            return { text: `${result.time}`, callback_data: `multi_time_toggle:${result.time}` };
                        });
                        
                        const timeKeyboardRows = [];
                        for (let i = 0; i < timeButtons.length; i += 3) {
                            timeKeyboardRows.push(timeButtons.slice(i, i + 3)); // Create rows of 3 buttons
                        }
                        // Add the 'Done' button as a separate row at the end
                        timeKeyboardRows.push([{ text: "Seçimi Bitir ✅", callback_data: 'multi_time_done' }]);

                        await bot.editMessageText(`Tarih: ${selectedDate}\nKalkış: ${requestData.mapped_departure}\nVarış: ${requestData.mapped_arrival}\n\nLütfen takip etmek istediğiniz sefer saatlerini seçin (birden fazla seçilebilir):`, {
                            chat_id: chatId,
                            message_id: msg.message_id,
                            reply_markup: { inline_keyboard: timeKeyboardRows }
                        });
                        // Store full results, initialize empty selected_times array
                        // IMPORTANT: Add selected_times (JSON/JSONB) column to user_requests table
                        updatePayload = { 
                            status: 'awaiting_multi_time_selection', 
                            last_check_results: parsedResults, 
                            selected_times: [] // Initialize as empty array
                        };

                    } else {
                        // This case now means no time slots were found/parsed at all
                        console.log(`[No Time Slots Found] for chat ${chatId}`);
                        let resultMessage = `Tarih: ${selectedDate}\nKalkış: ${requestData.mapped_departure}\nVarış: ${requestData.mapped_arrival}\n\n`;
                        resultMessage += "Belirtilen tarih için sefer bulunamadı.";
                        await bot.editMessageText(resultMessage, { 
                             chat_id: chatId,
                             message_id: msg.message_id,
                             reply_markup: { inline_keyboard: [] }
                        });
                        updatePayload = { status: 'completed', last_check_results: null }; 
                    }
                } finally {
                     // Ensure state is always updated, even if errors occurred before this point
                     if (Object.keys(updatePayload).length > 0) {
                         await updateUserState(chatId, updatePayload);
                     }
                }
            }); // End exec callback

        } else {
            console.log(`Unhandled callback data '${data}' for state '${currentState.status}'`);
        }

        // Optionally remove keyboard after handling (might already be done by editMessageText)
        // bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id });

    } catch (callbackError) {
         console.error(`[Callback Error] for chat ${chatId}, data ${data}:`, callbackError);
         bot.sendMessage(chatId, "Seçiminiz işlenirken bir hata oluştu. Lütfen tekrar deneyin.");
    }
});

// --- Function to handle station input --- 
async function handleStationInput(chatId, text, currentState, inputType) {
    const normalizedText = text.trim();
    const matches = findMatchingStations(normalizedText);

    const fieldToUpdate = inputType === 'departure' ? 'departure_input' : 'arrival_input';
    const mappedField = inputType === 'departure' ? 'mapped_departure' : 'mapped_arrival';
    const nextStatus = inputType === 'departure' ? 'awaiting_arrival' : 'awaiting_day';
    const choiceStatus = inputType === 'departure' ? 'awaiting_departure_choice' : 'awaiting_arrival_choice';
    const choicePrefix = inputType === 'departure' ? 'station_select_dep:' : 'station_select_arr:';
    const nextPrompt = inputType === 'departure'
        ? 'Şimdi varış istasyonunu yazın:'
        : 'Lütfen seferin gerçekleşeceği günü seçin:'; // Calendar will be sent

    if (matches.length === 1) {
        // Exact match found
        const selectedStationKey = matches[0];
        console.log(`Exact match for ${inputType}: ${selectedStationKey}`);

        const messageOptions = {};
        if (inputType === 'arrival') {
            // If it's the arrival station, send the calendar immediately
            const today = new Date();
            messageOptions.reply_markup = generateCalendarKeyboard(today.getFullYear(), today.getMonth());
        }

        bot.sendMessage(chatId, `${inputType === 'departure' ? 'Kalkış' : 'Varış'} istasyonu '${selectedStationKey}' olarak ayarlandı.\n${nextPrompt}`, messageOptions);

        await updateUserState(chatId, {
            [fieldToUpdate]: normalizedText,
            [mappedField]: selectedStationKey,
            status: nextStatus
        });
    } else if (matches.length > 1) {
        // Multiple matches found, ask user to choose
        console.log(`Multiple matches for ${inputType}:`, matches);
        const inlineKeyboard = matches.map(key => ([{
            text: key, // Show the full station name
            callback_data: `${choicePrefix}${key}`
        }]));

        bot.sendMessage(chatId, `'${normalizedText}' için birden fazla istasyon bulundu. Lütfen seçiminizi yapın:`, {
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        });
        // Update state to expect a callback query
        await updateUserState(chatId, {
            [fieldToUpdate]: normalizedText,
            status: choiceStatus
        });
    } else {
        // No match found
        console.log(`No match found for ${inputType}: ${normalizedText}`);
        bot.sendMessage(chatId, `'${normalizedText}' için uygun bir istasyon bulunamadı. Lütfen tekrar deneyin (örn: Ankara, Söğütlüçeşme, Eskişehir).`);
        // Keep the current status (awaiting_departure or awaiting_arrival)
    }
}

// Error Handling
bot.on('polling_error', (error) => {
    console.error(`Polling error: ${error.code} - ${error.message}`);
    // Potentially add more robust error handling/reconnection logic
});

bot.on('webhook_error', (error) => {
    console.error(`Webhook error: ${error.code} - ${error.message}`);
});

// --- Periodic Check Scheduler (node-cron) ---
console.log('Scheduling periodic seat check (every 5 minutes)...')
cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Running periodic check for available seats...');
    const scheduleTime = new Date(); // Log start time

    // 1. Fetch active monitoring requests
    const { data: requests, error: fetchError } = await supabase
        .from('user_requests')
        .select('*') // Select all needed fields
        .eq('status', 'monitoring');

    if (fetchError) {
        console.error('[Cron] Error fetching monitoring requests:', fetchError);
        return;
    }

    if (!requests || requests.length === 0) {
        console.log('[Cron] No active monitoring requests to check.');
        return;
    }

    console.log(`[Cron] Checking ${requests.length} monitoring requests...`);

    // 2. Loop through requests (run checks sequentially for now to avoid overwhelming the site/script)
    for (const req of requests) {
        // Basic check for essential data
        if (!req.mapped_departure || !req.mapped_arrival || !req.selected_date || !req.seat_type || !req.selected_times || req.selected_times.length === 0) {
             console.warn(`[Cron] Skipping request for chat ${req.chat_id} due to missing data:`, req);
             // Consider setting status to 'error' or 'cancelled' here after multiple failures
             continue;
        }
        
        try {
            console.log(`[Cron] Checking request for chat ${req.chat_id} (Date: ${req.selected_date}, Times: ${req.selected_times?.join(',')}, Type: ${req.seat_type})`);

            // 3. Construct and execute check_tcdd.js command
            const scriptPath = path.join(__dirname, 'check_tcdd.js');
            const command = `node "${scriptPath}" --nereden="${req.mapped_departure}" --nereye="${req.mapped_arrival}" --tarih="${req.selected_date}"`;
            
            const execPromise = util.promisify(exec);
            const { stdout, stderr } = await execPromise(command, { timeout: 90000 }); // Use longer timeout for cron

            if (stderr && !stderr.includes('INFO:CONSOLE')) { 
                 console.warn(`[Cron Check Stderr] for chat ${req.chat_id}: ${stderr}`);
            }
            
            // 4. Parse output
            const lines = stdout.split(/\r?\n/);
            const jsonLine = lines.find(line => line.startsWith('SEAT_DATA_JSON:'));
            if (!jsonLine) {
                 console.error(`[Cron Check Error] No SEAT_DATA_JSON found in output for chat ${req.chat_id}`);
                 continue; // Skip to next request
            }
            const jsonString = jsonLine.substring('SEAT_DATA_JSON:'.length);
            const currentResults = JSON.parse(jsonString);

            // 5. Check for matches
            let foundMatch = false;
            for (const timeResult of currentResults) {
                // Is this one of the times the user selected?
                if (req.selected_times?.includes(timeResult.time)) {
                    // Does the details object contain the seat type they want?
                    if (timeResult.details && timeResult.details[req.seat_type]) {
                         // Is the count greater than 0?
                         if (timeResult.details[req.seat_type] > 0) {
                            foundMatch = true;
                            const countFound = timeResult.details[req.seat_type];
                            console.log(`[Cron] === FOUND SEAT! === Chat: ${req.chat_id}, Time: ${timeResult.time}, Type: ${req.seat_type}, Count: ${countFound}`);
                            
                            // 6. Notify User
                            try {
                                await bot.sendMessage(req.chat_id, `🎉 Müjde! ${req.selected_date} ${timeResult.time} seferi için aradığınız '${req.seat_type}' tipinde ${countFound} adet boş koltuk bulundu!\nHemen Bilet Al: https://ebilet.tcddtasimacilik.gov.tr/`);
                                // 7. Update Status to completed after successful notification
                                await updateUserState(req.chat_id, { status: 'completed' }); 
                            } catch (notifyError) {
                                 console.error(`[Cron] FAILED TO NOTIFY chat ${req.chat_id}:`, notifyError);
                                 // Consider setting status to 'notification_failed' to retry later?
                            }
                            
                            break; // Stop checking other times for this user once found
                         }
                    }
                }
            }
            if (!foundMatch) {
                 console.log(`[Cron] No matching seats found this cycle for chat ${req.chat_id}`);
            }

        } catch (checkError) {
             // Handle potential errors like JSON parsing errors within the loop, timeout errors from exec etc.
             console.error(`[Cron] Error during check for chat ${req.chat_id}:`, checkError);
             // Optional: Implement retry logic or disable the request after repeated failures
        }
        // Optional: Add a small delay between checks if hitting rate limits
        // await new Promise(resolve => setTimeout(resolve, 500)); 
    }
    console.log(`[Cron] Finished periodic check. Duration: ${(new Date() - scheduleTime)/1000}s`);
});
const setWebhook = async () => {
    const webhookUrl = `YOUR_CLOUDRUN_SERVICE_URL${WEBHOOK_PATH}`; // Get this from gcloud or Console
    console.log(`Setting webhook to: ${webhookUrl}`);
    try {
        await bot.setWebHook(webhookUrl);
        console.log('Webhook set successfully!');
    } catch (error) {
        console.error('Error setting webhook:', error.response ? error.response.body : error.message);
    }
};

console.log(`HTTP Server started on port ${PORT}`);
console.log('Telegram bot started...');

// TODO: Add functions for station disambiguation (showing inline keyboard)
// TODO: Add function to call check_tcdd.js --list-times and parse output
// TODO: Integrate a calendar library for day selection
// TODO: Add inline keyboard for seat type selection

// Remove the invalid artifact from the previous edit

// TODO: Integrate a calendar library for day selection
// TODO: Add inline keyboard for seat type selection

// Remove the invalid artifact from the previous edit

