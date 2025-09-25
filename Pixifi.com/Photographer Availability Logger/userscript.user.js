// ==UserScript==
// @name         Photographer Availability Logger
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Full calendar availability tracking with cross-month ranges, date restrictions, clipboard support, and event filtering
// @match        https://www.pixifi.com/admin/events/
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    const DATE_SECTIONS = [
        { start: '03/12/2025', end: '03/18/2025' },
        { start: '03/19/2025', end: '03/25/2025' },
        { start: '03/26/2025', end: '04/01/2025' },
        { start: '04/02/2025', end: '04/08/2025' }
    ];

    const IGNORED_EVENT_TITLES = [
        'EVERY OTHER DAY ONLY'
    ];

    const COLOR_BLOCKING_MAP = {
        // Core event types
        'rgb(0, 0, 0)': false,        // NEWBORN INQUIRY (was #000000)
        'rgb(179, 45, 0)': false,     // SESSION GOOD TO GO (was #b32d00)
        'rgb(81, 186, 18)': true,     // ** BOOKING ** (was #51ba12)
        'rgb(147, 153, 0)': true,     // ***HOLD*** (was #939900)
        'rgb(143, 139, 8)': true,     // HR HOLD DO NOT BOOK (was #8f8b08)
        'rgb(138, 7, 141)': true,     // HOLIIDAY (was #8a078d)
        'rgb(27, 10, 104)': true,     // ** FAMILY WORKSHOP ** (was #1b0a68)
        'rgb(195, 6, 6)': true,       // SICK (was #c30606)
        'rgb(90, 4, 194)': true,      // ** MODEL HOLD ** (was #5a04c2)
        'rgb(88, 95, 99)': true,      // TRAINING MODEL SESSION (was #585f63)
        'rgb(35, 38, 40)': true,      // IN HOME MODEL SESSION (was #232628)
        'rgb(33, 102, 148)': true,    // PHOTOGRAPHER WORKSHOP (was #216694)
        'rgb(147, 10, 140)': true,    // TENTATIVE Photographer Workshop (was #930a8c)
        'rgb(190, 0, 204)': true,     // ONBOARDING (was #be00cc)
        'rgb(232, 230, 227)': true,   // PAYROLL CLOSE OUT (was #e8e6e3)
        'rgb(51, 56, 58)': true,      // TX SALES TAX DUE (was #33383a)
        'rgb(73, 79, 82)': true,      // TRAINING DATE (was #494f52)
        'rgb(66, 0, 147)': true,      // GIFT CARD PURCHASE (was #420093)
        'rgb(151, 17, 48)': true,     // BOOKING STAFF TIME OFF (was #971130)

        // Single Newborn statuses
        'rgb(62, 67, 69)': true,      // ATL NEWBORN (was #3e4345)
        'rgb(179, 45, 0)': true,      // AUS NEWBORN (was #b32d00)
        'rgb(37, 163, 90)': true,     // BOS NEWBORN (was #25a35a)
        'rgb(0, 14, 204)': true,      // CHI NEWBORN (was #000ecc)
        'rgb(91, 0, 36)': true,       // CLT NEWBORN (was #5b0024)
        'rgb(0, 80, 64)': true,       // COS NEWBORN (was #005040)
        'rgb(34, 100, 117)': true,    // DAL NEWBORN (was #226475)
        'rgb(92, 68, 0)': true,       // DC NEWBORN (was #5c4400)
        'rgb(33, 33, 90)': true,      // DEN NEWBORN (was #21215a)
        'rgb(14, 48, 120)': true,     // DET NEWBORN (was #0e3078)
        'rgb(78, 134, 16)': true,     // HOU NEWBORN (was #4e8610)
        'rgb(92, 83, 13)': true,      // JAX NEWBORN (was #5c530d)
        'rgb(100, 0, 0)': true,       // KC NEWBORN (was #640000)
        'rgb(115, 0, 46)': true,      // LA NEWBORN (was #73002e)
        'rgb(188, 7, 7)': true,       // LOU NEWBORN (was #bc0707)
        'rgb(0, 80, 64)': true,       // LVN NEWBORN (was #005040 again)
        'rgb(190, 12, 139)': true,    // MAN NEWBORN (was #be0c8b)
        'rgb(106, 44, 126)': true,    // MSP NEWBORN (was #6a2c7e)
        'rgb(92, 10, 88)': true,      // NYNJ NEWBORN (was #5c0a58)
        'rgb(134, 65, 0)': true,      // OC NEWBORN (was #864100)
        'rgb(78, 78, 0)': true,       // ORL NEWBORN (was #4e4e00)
        'rgb(0, 57, 145)': true,      // PHL NEWBORN (was #003991)
        'rgb(131, 87, 5)': true,      // PHX NEWBORN (was #835705)
        'rgb(104, 83, 39)': true,     // POR NEWBORN (was #685327)
        'rgb(27, 112, 155)': true,    // RAL NEWBORN (was #1b709b)
        'rgb(186, 17, 186)': true,    // RIV NEWBORN (was #ba11ba)
        'rgb(85, 0, 176)': true,      // SAC NEWBORN (was #5500b0)
        'rgb(21, 75, 130)': true,     // SD NEWBORN (was #154b82)
        'rgb(62, 59, 78)': true,      // SEA NEWBORN (was #3e3b4e)
        'rgb(126, 0, 0)': true,       // SF NEWBORN (was #7e0000)
        'rgb(32, 67, 13)': true,      // SLC NEWBORN (was #20430d)
        'rgb(153, 20, 20)': true,     // TPA NEWBORN (was #991414)
        'rgb(106, 25, 167)': true,    // BUF NEWBORN (was #6a19a7)
        'rgb(35, 109, 107)': true,    // NAS NEWBORN (was #236d6b)
        'rgb(20, 145, 145)': true,    // RIC NEWBORN (was #149191)

        // Twins
        'rgb(35, 109, 107)': true,    // NAS NEWBORN TWINS (also #236d6b)
        'rgb(56, 133, 131)': true,    // RIC NEWBORN TWINS (was #388583)
        'rgb(76, 82, 85)': true,      // SAT NEWBORN TWINs (was #4c5255)
        'rgb(0, 167, 0)': true,       // SEA NEWBORN TWINS (was #00a700)
        'rgb(54, 59, 61)': true,      // SF NEWBORN TWINS (was #363b3d)
        'rgb(27, 112, 155)': true,    // RAL NEWBORN TWINS (was #1b709b again)
        'rgb(133, 34, 133)': true,    // RIV NEWBORN TWINS (was #852285)
        'rgb(42, 91, 110)': true,     // JAX NEWBORN TWINS (was #2a5b6e)
        'rgb(145, 0, 0)': true,       // KC NEWBORN TWINS (was #910000)
        'rgb(204, 0, 82)': true,      // LA NEWBORN TWINS (was #cc0052)
        'rgb(185, 15, 15)': true,     // LOU NEWBORN TWINS (was #b90f0f)
        'rgb(52, 106, 96)': true,     // LVN NEWBORN TWINS (was #346a60)
        'rgb(78, 134, 16)': true,     // HOU NEWBORN TWINS (was #4e8610 again)
        'rgb(33, 33, 90)': true,      // DEN NEWBORN TWINS (was #21215a again)
        'rgb(24, 65, 153)': true,     // DET NEWBORN TWINS (was #184199)
        'rgb(91, 0, 36)': true,       // CLT NEWBORN TWINS (was #5b0024 again)
        'rgb(34, 100, 117)': true,    // DAL NEWBORN TWINS (was #226475 again)
        'rgb(137, 106, 15)': true,    // DC NEWBORN TWINS (was #896a0f)
        'rgb(190, 12, 139)': true,    // MAN NEWBORN TWINS (was #be0c8b again)
        'rgb(106, 44, 126)': true,    // MSP NEWBORN TWINS (was #6a2c7e again)
        'rgb(45, 32, 45)': true,      // NYNJ NEWBORN TWINS (was #2d202d)
        'rgb(153, 20, 20)': true,     // TPA NEWBORN TWINS (was #991414 again)
        'rgb(85, 0, 176)': true,      // SAC NEWBORN TWINS (was #5500b0 again)
        'rgb(131, 87, 5)': true,      // PHX NEWBORN TWINS (was #835705 again)
        'rgb(126, 117, 44)': true,    // POR NEWBORN TWINS (was #7e6916)
        'rgb(0, 57, 145)': true,      // PHL NEWBORN TWINS (was #003991 again)
        'rgb(134, 65, 0)': true,      // OC NEWBORN TWINS (was #864100 again)
        'rgb(116, 116, 18)': true,    // ORL NEWBORN TWINS (was #747412)
        'rgb(126, 105, 22)': true,    // ATL NEWBORN TWINS (was #7e6916)
        'rgb(73, 79, 82)': true,      // AUS NEWBORN TWINS (was #494f52 or #4c5255, adjust if needed)
        'rgb(69, 63, 16)': true,       // BOS NEWBORN TWINS (was #5b0024 again)
        'rgb(0, 14, 204)': true,      // CHI NEWBORN TWINS (was #000ecc again)
        'rgb(14, 66, 145)': true,      // SD NEWBORN TWINS

        // Triplets
        'rgb(153, 153, 0)': true,     // SD NEWBORN TRIPLETS (was #999900)
        'rgb(126, 105, 22)': true,    // ATL NEWBORN TRIPLETS (was #7e6916)
        'rgb(12, 20, 139)': true,     // CHI NEWBORN TRIPLETS (was #0c148b)
        'rgb(34, 100, 117)': true,    // DAL NEWBORN TRIPLETS (was #226475 again)
        'rgb(137, 106, 15)': true,    // DC NEWBORN TRIPLETS (was #896a0f again)
        'rgb(74, 96, 37)': true,      // HOU NEWBORN TRIPLETS (was #4a6025)
        'rgb(88, 67, 87)': true,      // NYNJ NEWBORN TRIPLETS (was #584357)
        'rgb(148, 82, 21)': true,     // OC NEWBORN TRIPLETS (was #945215)
        'rgb(25, 64, 100)': true,     // PHL NEWBORN TRIPLETS (was #194064)
        'rgb(64, 69, 72)': true,      // POR NEWBORN TRIPLETS (was #404548)
        'rgb(122, 60, 118)': true,    // SAC NEWBORN TRIPLETS (was #7a3c76)
    };

    function init() {
        addRecheckButton();
        logAvailability();
    }

    const unknownColors = new Set();

    function addRecheckButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Recheck Calendar Availability';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '80px',
            left: '200px',
            zIndex: '9999',
            padding: '8px 16px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        });

        btn.addEventListener('mouseover', () => {
            btn.style.backgroundColor = '#45a049';
            btn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        });

        btn.addEventListener('mouseout', () => {
            btn.style.backgroundColor = '#4CAF50';
            btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        });

        btn.addEventListener('mousedown', () => {
            btn.style.backgroundColor = '#3d8b40';
            btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)';
        });

        btn.addEventListener('mouseup', () => {
            btn.style.backgroundColor = '#45a049';
        });
        btn.addEventListener('click', logAvailability);
        document.body.appendChild(btn);
    }

    function parseWeek(weekEl) {
        const days = Array.from({length: 7}, () => ({
            backgroundValue: 1,
            events: []
        }));

        const bgSkeletons = weekEl.querySelectorAll('.fc-bgevent-skeleton');
        bgSkeletons.forEach(skeleton => {
            const rows = skeleton.querySelectorAll('tr');
            rows.forEach(tr => {
                let dayIndex = 0;
                tr.querySelectorAll('td').forEach(td => {
                    const span = td.colSpan || 1;
                    const isUnavailable = td.classList.contains('fc-unavailable');

                    for(let i = 0; i < span; i++) {
                        if(dayIndex + i >= 7) break;
                        if(isUnavailable) {
                            days[dayIndex + i].backgroundValue = 0;
                        }
                    }
                    dayIndex += span;
                });
            });
        });

        const contentSkeletons = weekEl.querySelectorAll('.fc-content-skeleton');
        contentSkeletons.forEach(skeleton => {
            const rows = skeleton.querySelectorAll('tr');
            const rowspanGrid = Array.from({length: rows.length}, () => new Array(7).fill(false));

            rows.forEach((tr, rowIndex) => {
                let dayIndex = 0;

                tr.querySelectorAll('td').forEach(td => {
                    while(dayIndex < 7 && rowspanGrid[rowIndex][dayIndex]) {
                        dayIndex++;
                    }

                    const span = td.colSpan || 1;
                    const rowspan = td.rowSpan || 1;
                    const events = Array.from(td.querySelectorAll('.pxEvent'))
                        .filter(eventEl => {
                            const title = eventEl.querySelector('.fc-title')?.textContent.trim();
                            return !IGNORED_EVENT_TITLES.includes(title);
                        })
                        .map(eventEl => {
                        const bgColor = getComputedStyle(eventEl).backgroundColor;
                        const title = eventEl.querySelector('.fc-title')?.textContent.trim();

                        let isBlocking = COLOR_BLOCKING_MAP.default;
                        if(COLOR_BLOCKING_MAP.hasOwnProperty(bgColor)) {
                            isBlocking = COLOR_BLOCKING_MAP[bgColor];
                        } else {
                            unknownColors.add(`${bgColor} - ${title}`);
                            isBlocking = true
                        }

                        return {
                            title,
                            color: bgColor,
                            isBlocking,
                            value: isBlocking ? 0 : 1
                        };
                    });

                    for(let rs = 0; rs < rowspan; rs++) {
                        for(let cs = 0; cs < span; cs++) {
                            if(rowIndex + rs < rows.length && dayIndex + cs < 7) {
                                rowspanGrid[rowIndex + rs][dayIndex + cs] = true;
                            }
                        }
                    }

                    for(let i = 0; i < span; i++) {
                        const currentDay = dayIndex + i;
                        if(currentDay >= 7) break;

                        days[currentDay].events.push(...events);
                    }

                    dayIndex += span;
                });
            });
        });

        return days;
    }

    function parseDate(dateStr) {
        const [month, day, year] = dateStr.split('/');
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    }

    function isDateInRange(date, startDate, endDate) {
        const time = date.getTime();
        return time >= startDate.getTime() && time <= endDate.getTime();
    }

    function getDateFromDayEl(dayEl) {
        const dateString = dayEl.getAttribute('data-date');
        if(!dateString) return null;

        const [year, month, day] = dateString.split('-');
        // Create date using UTC to avoid timezone offset issues
        const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        return {
            date,
            formatted: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
            weekday: date.toLocaleDateString('en-US', { weekday: 'long' })
        };
    }

    function logAvailability() {
        console.clear();
        const allMonths = document.querySelectorAll('[id^="month-"]');
        const allDays = [];

        allMonths.forEach(monthEl => {
            const monthId = monthEl.id;
            const [_, monthNumber, year] = monthId.split('-');
            const monthName = new Date(Date.UTC(parseInt(year), parseInt(monthNumber), 1)).toLocaleString('default', { month: 'long' });

            console.log(`=== ${monthName} ${year} Availability ===`);

            const weeks = monthEl.querySelectorAll('.fc-week');

            weeks.forEach((weekEl, weekIndex) => {
                const weekDays = parseWeek(weekEl);

                weekDays.forEach((dayInfo, dayIndex) => {
                    const dayEl = weekEl.querySelector(`.fc-day:nth-child(${dayIndex + 1})`);
                    const dateInfo = getDateFromDayEl(dayEl);

                    if(!dateInfo || !dateInfo.date) return;

                    const monthFromDate = dateInfo.date.getUTCMonth() + 1;
                    if(monthFromDate != monthNumber) return;

                    // Get current date in UTC
                    const now = new Date();
                    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

                    // Calculate event values and logs first
                    const eventValues = dayInfo.events.map(e => e.value);
                    const eventLogs = dayInfo.events.map((e, i) =>
                        `event${i+1}: ${e.title} - event${i+1}value: ${e.value}`
                    ).join(' - ');

                    // Calculate base value from events
                    const baseValue = eventValues.length ? eventValues.reduce((a, b) => a * b, 1) : 1;

                    // Mark past days, today, and tomorrow as unavailable
                    //const dayValue = dateInfo.date <= tomorrow ? 0 :
                        const dayValue = dayInfo.backgroundValue * baseValue;

                    // Store day info
                    allDays.push({
                        date: dateInfo.date,
                        value: dayValue,
                        formatted: dateInfo.formatted
                    });

                    // Log day info
                    const valueCalculation = eventValues.length ?
                        `${dayInfo.backgroundValue}*${eventValues.join('*')}=${dayValue}` :
                        `${dayInfo.backgroundValue}=${dayValue}`;

                    console.log([
                        `${dateInfo.formatted} - ${dayValue} - ${dateInfo.weekday}`,
                        `dayvalue:${valueCalculation}`,
                        `daybackgroundvalue: ${dayInfo.backgroundValue}`,
                        `Events: ${dayInfo.events.length}`,
                        eventLogs
                    ].join(' - '));
                });
            });
        });

        // Show availability ranges once at the end for all days
        console.log('\n=== Availability Ranges ===');
        const availableDaysList = [];

        DATE_SECTIONS.forEach(section => {
            const startDate = parseDate(section.start);
            const endDate = parseDate(section.end);
            const daysInRange = allDays.filter(day =>
                isDateInRange(day.date, startDate, endDate)
            );

            const availableDays = daysInRange.filter(day => day.value === 1).length;
            const startFormatted = `${startDate.getUTCMonth() + 1}/${startDate.getUTCDate()}`;
            const endFormatted = `${endDate.getUTCMonth() + 1}/${endDate.getUTCDate()}`;

            availableDaysList.push(availableDays);

            console.log(
                `${startFormatted}-${endFormatted} - ${availableDays} day${availableDays !== 1 ? 's' : ''} available. ` +
                `(${daysInRange.length} days total)`
            );
        });

        // Copy available days to clipboard
        const clipboardText = availableDaysList.join(',');
        GM_setClipboard(clipboardText);
        console.log(`\nCopied to clipboard: ${clipboardText}`);

        // Log any unknown colors
        if (unknownColors.size > 0) {
            console.log('\n=== Unknown Event Colors ===');
            Array.from(unknownColors).sort().forEach(color => {
                console.log(color);
            });
        }
    }

    window.addEventListener('load', init);
})();
