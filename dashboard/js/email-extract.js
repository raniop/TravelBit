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

    // 3. Customer Name — Hebrew patterns
    const namePatterns = [
        /עבור\s+([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/,
        /שם\s*(?:הלקוח|המבוטח|:)\s*:?\s*([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/,
        /לכבוד\s+([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/,
        /מבוטח\s*:?\s*([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/,
        /(?:גב'|מר|גברת|אדון)\s+([א-ת][א-ת'"-]+\s+[א-ת][א-ת'"-]+)/
    ];
    for (const pattern of namePatterns) {
        const match = searchText.match(pattern);
        if (match) {
            const name = match[1].trim();
            // Validate: not too long, not a common word
            if (name.length >= 3 && name.length <= 40) {
                data.customerName = name;
                data._extractedFields.push('customerName');
                break;
            }
        }
    }

    // 4. ID Number (ת.ז.) — with keyword context first, then fallback
    const idPatterns = [
        /ת"?\.?ז"?\.?\s*:?\s*(\d{8,9})/,
        /תעודת\s*זהות\s*:?\s*(\d{8,9})/,
        /ת\.ז\.\s*(\d{8,9})/,
        /ת"ז\s*(\d{8,9})/
    ];
    for (const pattern of idPatterns) {
        const match = searchText.match(pattern);
        if (match) {
            data.idNumber = match[1];
            data._extractedFields.push('idNumber');
            break;
        }
    }
    // Fallback: any 9-digit number (if no keyword match found)
    if (!data.idNumber) {
        const fallbackId = searchText.match(/\b(\d{9})\b/);
        if (fallbackId) {
            // Make sure it's not a phone number
            const candidate = fallbackId[1];
            if (!candidate.startsWith('05') && !candidate.startsWith('03') && !candidate.startsWith('02') && !candidate.startsWith('04') && !candidate.startsWith('08') && !candidate.startsWith('09') && !candidate.startsWith('07')) {
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

    // 8. Date — DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
    const dateMatch = searchText.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (dateMatch) {
        let day = dateMatch[1].padStart(2, '0');
        let month = dateMatch[2].padStart(2, '0');
        let year = dateMatch[3];
        if (year.length === 2) year = '20' + year;

        // Validate date components
        const d = parseInt(day), m = parseInt(month), y = parseInt(year);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2099) {
            data.date = `${year}-${month}-${day}`;
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
    const allText = extractAllTextFromMime(raw);

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
    if (!depth) depth = 0;
    if (depth > 10) return ''; // prevent infinite recursion

    const texts = [];

    // Split headers from body
    const headers = getHeaders(rawMime);
    const bodyStart = findBodyStart(rawMime);
    const bodyPart = bodyStart >= 0 ? rawMime.substring(bodyStart) : '';

    const contentType = (headers['content-type'] || '').toLowerCase();
    const encoding = (headers['content-transfer-encoding'] || '').toLowerCase().trim();
    const charsetMatch = contentType.match(/charset="?([^"\s;]+)"?/i);
    const charset = charsetMatch ? charsetMatch[1] : 'utf-8';

    // Case 1: multipart/* — split by boundary and recurse into each part
    const boundaryMatch = contentType.match(/boundary="?([^"\r\n;]+)"?/);
    if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const parts = bodyPart.split('--' + boundary);
        for (let i = 1; i < parts.length; i++) { // skip preamble (index 0)
            const part = parts[i];
            if (part.trimStart().startsWith('--')) continue; // skip epilogue
            texts.push(extractAllTextFromMime(part, depth + 1));
        }
        return texts.filter(Boolean).join('\n');
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
