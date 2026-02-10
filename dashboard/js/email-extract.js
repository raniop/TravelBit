// Email Data Extraction — Shared module for smart email parsing
// Used by both reminders.js (dashboard) and reminder-detail.js (detail page)

// ===== Insurance Company Domain Map =====
const INSURANCE_DOMAIN_MAP = {
    'migdal': 'מגדל',
    'harel': 'הראל',
    'clal': 'כלל',
    'phoenix': 'הפניקס',
    'menora': 'מנורה מבטחים',
    'ayalon': 'איילון',
    'shlomo': 'שלמה ביטוח',
    'dikla': 'דיקלה',
    'bituah-yashir': 'ביטוח ישיר',
    'bituach-yashir': 'ביטוח ישיר',
    'altshuler': 'אלטשולר שחם',
    'as-invest': 'אלטשולר שחם',
    'psagot': 'פסגות',
    'meitav': 'מיטב דש',
    'analyst': 'אנליסט',
    'shomera': 'שומרה',
    'aia': 'AIA',
    'aig': 'AIG'
};

// Hebrew insurance company names for content matching
const INSURANCE_NAMES_HEB = [
    'מגדל', 'הראל', 'כלל', 'הפניקס', 'מנורה מבטחים', 'מנורה',
    'איילון', 'שלמה ביטוח', 'שלמה', 'דיקלה', 'ביטוח ישיר',
    'אלטשולר שחם', 'אלטשולר', 'פסגות', 'מיטב דש', 'מיטב',
    'אנליסט', 'שומרה', 'AIA', 'AIG'
];

// ===== Reminder Type Keywords =====
const TYPE_KEYWORDS = {
    claims: ['תביעה', 'תביעת', 'claim', 'claims', 'פיצוי', 'פיצויים', 'נזק', 'אירוע ביטוחי', 'החזר הוצאות'],
    policyCancellations: ['ביטול', 'ביטולי', 'cancellation', 'הפסקת פוליסה', 'הפסקה', 'סיום פוליסה'],
    newProductions: ['הפקה', 'הפקת', 'פוליסה חדשה', 'new policy', 'הצטרפות', 'הצעת מחיר', 'הצעה'],
    agentAppointment: ['מינוי סוכן', 'מינוי', 'agent appointment', 'העברת תיק', 'העברת סוכן', 'ייפוי כוח'],
    firstDeposit: ['הפקדה', 'הפקדה ראשונה', 'deposit', 'העברה ראשונה', 'תשלום ראשון'],
    completingDeficiencies: ['חוסר', 'חוסרים', 'השלמה', 'השלמת', 'deficiency', 'מסמכים חסרים', 'מסמך חסר', 'חסר']
};

// ===== Main Extraction Function =====
function extractEmailDataEnhanced(text, html) {
    const data = {
        source: 'text',
        notes: (text || '').substring(0, 500),
        _extractedFields: []
    };

    // Use combined text for searching (prefer plain text, fallback to stripped HTML)
    const searchText = text || stripHtml(html || '');
    if (!searchText) return data;

    // 1. Insurance Company — scan ALL email domains, prefer insurance company
    const allEmails = searchText.matchAll(/[\w.-]+@([\w.-]+\.\w+)/g);
    for (const emailMatch of allEmails) {
        const domain = emailMatch[1].toLowerCase();
        for (const [key, name] of Object.entries(INSURANCE_DOMAIN_MAP)) {
            if (domain.includes(key)) {
                data.insuranceCompany = name;
                data._extractedFields.push('insuranceCompany');
                break;
            }
        }
        if (data.insuranceCompany) break;
    }

    // 1b. Insurance Company — from content (if not found from domain)
    if (!data.insuranceCompany) {
        for (const name of INSURANCE_NAMES_HEB) {
            if (searchText.includes(name)) {
                data.insuranceCompany = name;
                data._extractedFields.push('insuranceCompany');
                break;
            }
        }
    }

    // 2. Reminder Type — detect from keywords
    let bestTypeMatch = null;
    let bestTypeScore = 0;
    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
            if (searchText.includes(kw)) score++;
        }
        if (score > bestTypeScore) {
            bestTypeScore = score;
            bestTypeMatch = type;
        }
    }
    if (bestTypeMatch) {
        data.detectedType = bestTypeMatch;
        data._extractedFields.push('detectedType');
    }

    // 3+4. Customer Name + ID — try combined pattern first (name + number pair)
    // Stopwords: common Hebrew words that are NOT person names
    const NAME_STOPWORDS = ['על', 'את', 'כל', 'של', 'הם', 'עם', 'כי', 'גם', 'או', 'לא', 'זה', 'מה', 'אם', 'יש', 'לו', 'לה', 'הן', 'אל', 'רק', 'עד', 'בו', 'בה', 'כן', 'לי', 'לך', 'בי', 'זו', 'דף', 'פי'];
    const NAME_STOP_LAST = ['המסמכים', 'הטופס', 'הפוליסה', 'התביעה', 'הביטוח', 'החברה', 'הלקוח', 'המבוטח', 'הסוכן', 'הבקשה', 'הכספים', 'הטיפול', 'התיק', 'המכתב', 'הנושא', 'האישור', 'השירות', 'הדוח'];

    function isValidName(name) {
        if (!name || name.length < 3 || name.length > 40) return false;
        const parts = name.trim().split(/\s+/);
        if (parts.length < 2) return false;
        if (NAME_STOPWORDS.includes(parts[0])) return false;
        if (NAME_STOP_LAST.includes(parts[parts.length - 1])) return false;
        // Each part should be at least 2 chars
        if (parts.some(p => p.length < 2)) return false;
        return true;
    }

    // 3a. Try combined: name + optional ת.ז. + ID number (captures both at once)
    // Note: [\s,]+ after עבור to handle "עבור,סיוון" (comma instead of space — common in Migdal emails)
    const combinedPatterns = [
        /עבור[\s,]+([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)\s+(?:ת["\u0022\u201C\u201D]?\.?ז["\u0022\u201C\u201D]?\.?\s*:?\s*)?(\d{8,9})/g,
        /מבוטח\s*:?\s*([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)\s+(?:ת["\u0022\u201C\u201D]?\.?ז["\u0022\u201C\u201D]?\.?\s*:?\s*)?(\d{8,9})/g,
        /שם[^:]*:\s*([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)\s+(?:ת["\u0022\u201C\u201D]?\.?ז["\u0022\u201C\u201D]?\.?\s*:?\s*)?(\d{8,9})/g
    ];

    for (const pattern of combinedPatterns) {
        pattern.lastIndex = 0; // reset global regex
        let match;
        while ((match = pattern.exec(searchText)) !== null) {
            const candidateName = match[1].trim();
            const candidateId = match[2];
            if (isValidName(candidateName)) {
                data.customerName = candidateName;
                data._extractedFields.push('customerName');
                data.idNumber = candidateId;
                data._extractedFields.push('idNumber');
                break;
            }
        }
        if (data.customerName) break;
    }

    // 3b. If no combined match, try name-only patterns (with matchAll to skip bad matches)
    if (!data.customerName) {
        const namePatterns = [
            /עבור[\s,]+([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/g,
            /שם\s*(?:הלקוח|המבוטח|:)\s*:?\s*([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/g,
            /לכבוד\s+([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/g,
            /מבוטח\s*:?\s*([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/g,
            /(?:גב'|מר|גברת|אדון)\s+([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/g
        ];
        for (const pattern of namePatterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(searchText)) !== null) {
                if (isValidName(match[1])) {
                    data.customerName = match[1].trim();
                    data._extractedFields.push('customerName');
                    break;
                }
            }
            if (data.customerName) break;
        }
    }

    // 4. ID Number (ת.ז.) — if not found via combined pattern above
    if (!data.idNumber) {
        const idPatterns = [
            /ת["\u0022\u201C\u201D]?\.?\s*ז["\u0022\u201C\u201D]?\.?\s*:?\s*(\d{8,9})/,
            /תעודת[\s\u00A0]*זהות\s*:?\s*(\d{8,9})/,
            /ת[\s\u00A0]*\.[\s\u00A0]*ז[\s\u00A0]*\.?\s*:?\s*(\d{8,9})/
        ];
        for (const pattern of idPatterns) {
            const match = searchText.match(pattern);
            if (match) {
                data.idNumber = match[1];
                data._extractedFields.push('idNumber');
                break;
            }
        }
    }
    // Fallback: any 8-9 digit number near Hebrew name text (not a phone)
    if (!data.idNumber) {
        const fallbackId = searchText.match(/(?<!\d)(\d{8,9})(?!\d)/);
        if (fallbackId) {
            const candidate = fallbackId[1];
            // Exclude phone numbers (start with 0)
            if (!candidate.startsWith('0')) {
                data.idNumber = candidate;
                data._extractedFields.push('idNumber');
            }
        }
    }

    // 5. Phone Number — Israeli format
    const phoneMatch = searchText.match(/0[2-9]\d[\s-]?\d{3}[\s-]?\d{4}|0[2-9]\d{7,8}/);
    if (phoneMatch) {
        data.phone = phoneMatch[0].replace(/[\s-]/g, '');
        data._extractedFields.push('phone');
    }

    // 6. Amount — with currency symbol or keyword
    const amountPatterns = [
        /(?:₪|NIS|ש"ח)\s*([\d,]+\.?\d*)/,
        /([\d,]+\.?\d*)\s*(?:₪|NIS|ש"ח)/,
        /סכום\s*:?\s*([\d,]+\.?\d*)/,
        /סה"כ\s*:?\s*([\d,]+\.?\d*)/
    ];
    for (const pattern of amountPatterns) {
        const match = searchText.match(pattern);
        if (match) {
            const val = parseFloat(match[1].replace(/,/g, ''));
            if (val > 0) {
                data.amount = val;
                data._extractedFields.push('amount');
                break;
            }
        }
    }

    // 7. Policy Number
    const policyPatterns = [
        /פוליס[הת]\s*(?:מספר|מס['׳]?)?\s*:?\s*#?\s*(\d{5,15})/,
        /מספר\s*פוליס[הת]\s*:?\s*#?\s*(\d{5,15})/,
        /policy\s*(?:number|no\.?)?\s*:?\s*#?\s*(\d{5,15})/i
    ];
    for (const pattern of policyPatterns) {
        const match = searchText.match(pattern);
        if (match) {
            data.policyNumber = match[1];
            data._extractedFields.push('policyNumber');
            break;
        }
    }

    // 8. Date — DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY (Israeli format)
    const dateMatch = searchText.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (dateMatch) {
        let day = dateMatch[1].padStart(2, '0');
        let month = dateMatch[2].padStart(2, '0');
        let year = dateMatch[3];
        if (year.length === 2) year = '20' + year;

        // Validate date components
        const d = parseInt(day), m = parseInt(month), y = parseInt(year);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2099) {
            data.date = `${day}/${month}/${year}`;
            data._extractedFields.push('date');
        }
    }

    return data;
}

// ===== Read .eml / .msg file =====
function readEmailFile(file) {
    return new Promise((resolve) => {
        const name = file.name || '';
        const ext = name.split('.').pop().toLowerCase();

        // .eml files are plain text (RFC 822) — readable with FileReader
        if (ext === 'eml') {
            const reader = new FileReader();
            reader.onload = function(e) {
                const raw = e.target.result || '';
                const parsed = parseEmlContent(raw, name);
                resolve(parsed);
            };
            reader.onerror = function() {
                resolve(extractFromFileName(name));
            };
            reader.readAsText(file, 'utf-8');
        } else {
            resolve(extractFromFileName(name));
        }
    });
}

function parseEmlContent(raw, fileName) {
    // Extract ALL text from the .eml recursively (handles forwarded, multipart, nested)
    const allText = extractAllTextFromMime(raw, 0);

    // Also extract subject and from from top-level headers
    const topHeaders = getHeaders(raw);
    let subject = decodeEmlHeader(topHeaders['subject'] || '');
    let fromHeader = decodeEmlHeader(topHeaders['from'] || '');

    // Combine: subject + from + all extracted body text
    const combinedText = [subject, fromHeader, allText].filter(Boolean).join('\n');

    // Run enhanced extraction
    const data = extractEmailDataEnhanced(combinedText, '');
    data.source = 'file';

    // Readable notes
    const readableNotes = [subject, allText.substring(0, 400)].filter(Boolean).join('\n');
    if (readableNotes.trim()) {
        data.notes = readableNotes.substring(0, 500);
    } else {
        data.notes = 'יובא מקובץ: ' + fileName;
    }

    // Fallback: try filename for type detection
    if (!data.detectedType) {
        const fnData = extractFromFileName(fileName);
        if (fnData.detectedType) {
            data.detectedType = fnData.detectedType;
            if (!data._extractedFields.includes('detectedType')) {
                data._extractedFields.push('detectedType');
            }
        }
    }

    return data;
}

// ===== Recursive MIME text extractor =====
// Extracts ALL readable text from any MIME structure:
// text/plain, text/html (stripped), message/rfc822 (recursive), multipart/* (recursive)
function extractAllTextFromMime(rawMime, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 10) return ''; // prevent infinite recursion

    // Trim leading whitespace/newlines (parts from boundary splits start with \r\n)
    const trimmed = rawMime.replace(/^[\r\n]+/, '');

    const texts = [];

    // Split headers from body
    const headers = getHeaders(trimmed);
    const bodyStart = findBodyStart(trimmed);
    const bodyPart = bodyStart >= 0 ? trimmed.substring(bodyStart) : '';

    const contentType = (headers['content-type'] || '').toLowerCase();
    const encoding = (headers['content-transfer-encoding'] || '').toLowerCase().trim();
    const charsetMatch = contentType.match(/charset="?([^"\s;]+)"?/i);
    const charset = charsetMatch ? charsetMatch[1] : 'utf-8';

    // Case 1: multipart/* — split by boundary and recurse into each part
    let boundary = null;

    // Try to extract boundary from Content-Type header
    const bQuoted = contentType.match(/boundary="([^"]+)"/);      // boundary="xxx"
    const bUnquoted = contentType.match(/boundary=([^\s;]+)/);    // boundary=xxx
    if (bQuoted) boundary = bQuoted[1];
    else if (bUnquoted) boundary = bUnquoted[1];

    if (boundary) {
        let parts = bodyPart.split('--' + boundary);

        // If boundary didn't work, try finding actual boundary from body
        if (parts.length <= 1 && bodyPart.includes('--')) {
            const bodyLine = bodyPart.match(/^(--[^\r\n]+)/m);
            if (bodyLine) {
                const actualBoundary = bodyLine[1].substring(2); // remove leading --
                parts = bodyPart.split('--' + actualBoundary);
            }
        }

        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            if (part.trimStart().startsWith('--')) continue; // skip epilogue
            texts.push(extractAllTextFromMime(part, depth + 1));
        }
        if (texts.filter(Boolean).length > 0) return texts.filter(Boolean).join('\n');
    }

    // Case 2: message/rfc822 — the body IS another full email message
    if (contentType.includes('message/rfc822')) {
        texts.push(extractAllTextFromMime(bodyPart, depth + 1));
        return texts.filter(Boolean).join('\n');
    }

    // Case 3: text/plain — decode and return
    if (contentType.includes('text/plain') || (!contentType && bodyPart.trim())) {
        const decoded = decodeBodyContent(bodyPart, encoding, charset);
        if (decoded.trim()) texts.push(decoded);
        return texts.join('\n');
    }

    // Case 4: text/html — decode, strip tags, return
    if (contentType.includes('text/html')) {
        const decoded = decodeBodyContent(bodyPart, encoding, charset);
        if (decoded.trim()) texts.push(stripHtml(decoded));
        return texts.join('\n');
    }

    // Case 5: no Content-Type header (might be inline text in forwarded body)
    // Try to decode as plain text
    if (!contentType && bodyPart.trim().length > 20) {
        const decoded = decodeBodyContent(bodyPart, encoding, charset);
        if (decoded.trim()) texts.push(decoded);
    }

    return texts.filter(Boolean).join('\n');
}

// Get headers as key-value object (handles folded headers)
function getHeaders(raw) {
    // Find end of headers
    let endIdx = raw.indexOf('\r\n\r\n');
    let sepLen = 4;
    if (endIdx < 0) {
        endIdx = raw.indexOf('\n\n');
        sepLen = 2;
    }
    if (endIdx < 0) return {};

    const headerBlock = raw.substring(0, endIdx);
    const headers = {};

    // Unfold headers (lines starting with space/tab are continuations)
    const unfolded = headerBlock.replace(/\r?\n([ \t]+)/g, ' ');
    const lines = unfolded.split(/\r?\n/);

    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
            const key = line.substring(0, colonIdx).trim().toLowerCase();
            const val = line.substring(colonIdx + 1).trim();
            headers[key] = val;
        }
    }

    return headers;
}

// Find where body starts (after first blank line)
function findBodyStart(raw) {
    let idx = raw.indexOf('\r\n\r\n');
    if (idx >= 0) return idx + 4;
    idx = raw.indexOf('\n\n');
    if (idx >= 0) return idx + 2;
    return -1;
}

function decodeEmlHeader(header) {
    if (!header) return '';
    // Decode RFC 2047 encoded-words: =?charset?encoding?text?=
    // Handle consecutive encoded words (join them)
    let decoded = header.replace(/=\?([^?]+)\?(B|Q)\?([^?]+)\?=(\s*=\?[^?]+\?(B|Q)\?[^?]+\?=)*/gi, function(fullMatch) {
        const words = fullMatch.match(/=\?([^?]+)\?(B|Q)\?([^?]+)\?=/gi) || [];
        const allBytes = [];
        let detectedCharset = 'utf-8';

        for (const word of words) {
            const parts = word.match(/=\?([^?]+)\?(B|Q)\?([^?]+)\?=/i);
            if (!parts) continue;
            const cs = parts[1].toLowerCase();
            const enc = parts[2].toUpperCase();
            const text = parts[3];
            detectedCharset = cs;

            try {
                if (enc === 'B') {
                    const binary = atob(text);
                    for (let i = 0; i < binary.length; i++) {
                        allBytes.push(binary.charCodeAt(i));
                    }
                } else {
                    const qpText = text.replace(/_/g, ' ');
                    let i = 0;
                    while (i < qpText.length) {
                        if (qpText[i] === '=' && i + 2 < qpText.length) {
                            allBytes.push(parseInt(qpText.substring(i + 1, i + 3), 16));
                            i += 3;
                        } else {
                            allBytes.push(qpText.charCodeAt(i));
                            i++;
                        }
                    }
                }
            } catch (e) {}
        }

        if (allBytes.length === 0) return fullMatch;

        try {
            return new TextDecoder(detectedCharset).decode(new Uint8Array(allBytes));
        } catch (e) {
            try {
                return new TextDecoder('utf-8').decode(new Uint8Array(allBytes));
            } catch (e2) {
                return fullMatch;
            }
        }
    });

    return decoded;
}

function decodeBodyContent(text, encoding, charset) {
    charset = charset || 'utf-8';
    try {
        if (encoding === 'base64') {
            const cleaned = text.replace(/[\r\n\s]/g, '');
            if (!cleaned) return '';
            const binary = atob(cleaned);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            try {
                return new TextDecoder(charset).decode(bytes);
            } catch (e) {
                return new TextDecoder('utf-8').decode(bytes);
            }
        } else if (encoding === 'quoted-printable') {
            const cleaned = text.replace(/=\r?\n/g, '');
            const bytes = [];
            let i = 0;
            while (i < cleaned.length) {
                if (cleaned[i] === '=' && i + 2 < cleaned.length && /[0-9A-Fa-f]{2}/.test(cleaned.substring(i + 1, i + 3))) {
                    bytes.push(parseInt(cleaned.substring(i + 1, i + 3), 16));
                    i += 3;
                } else {
                    bytes.push(cleaned.charCodeAt(i));
                    i++;
                }
            }
            try {
                return new TextDecoder(charset).decode(new Uint8Array(bytes));
            } catch (e) {
                return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
            }
        }
    } catch (e) {}
    return text;
}

function extractFromFileName(name) {
    const cleanName = name.replace(/\.(eml|msg)$/i, '').replace(/^(Fw|Fwd|Re)-?\s*/i, '').trim();
    const data = extractEmailDataEnhanced(cleanName, '');
    data.source = 'file';
    data.notes = 'יובא מקובץ: ' + name;
    return data;
}

// Helper: strip HTML tags
function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

// Helper: show extraction toast
function showExtractionToast(count) {
    if (count <= 0) return;

    const existing = document.querySelector('.extract-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'extract-toast';
    toast.textContent = `זוהו ${count} שדות אוטומטית`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Helper: convert ISO date (YYYY-MM-DD) to Israeli format (DD/MM/YYYY)
function isoToIL(isoDate) {
    if (!isoDate) return '';
    // Already in DD/MM/YYYY?
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDate)) return isoDate;
    const parts = isoDate.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoDate;
}

// Helper: convert Israeli format (DD/MM/YYYY) to ISO (YYYY-MM-DD) for DB storage
function ilToIso(ilDate) {
    if (!ilDate) return '';
    // Already in YYYY-MM-DD?
    if (/^\d{4}-\d{2}-\d{2}$/.test(ilDate)) return ilDate;
    const parts = ilDate.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return ilDate;
}

// Helper: mark field as auto-filled and setup cleanup
function markAutoFilled(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.add('auto-filled');
    el.addEventListener('focus', function handler() {
        el.classList.remove('auto-filled');
        el.removeEventListener('focus', handler);
    });
}
