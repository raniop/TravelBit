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

    // 1. Insurance Company — from email domain
    const emailMatch = searchText.match(/[\w.-]+@([\w.-]+)\.\w+/);
    if (emailMatch) {
        const domain = emailMatch[1].toLowerCase();
        for (const [key, name] of Object.entries(INSURANCE_DOMAIN_MAP)) {
            if (domain.includes(key)) {
                data.insuranceCompany = name;
                data._extractedFields.push('insuranceCompany');
                break;
            }
        }
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
                // Parse .eml: extract subject, from, and body text
                const parsed = parseEmlContent(raw, name);
                resolve(parsed);
            };
            reader.onerror = function() {
                // Fallback: extract what we can from filename
                resolve(extractFromFileName(name));
            };
            reader.readAsText(file, 'utf-8');
        } else {
            // .msg or unknown: can't read in browser, extract from filename
            resolve(extractFromFileName(name));
        }
    });
}

function parseEmlContent(raw, fileName) {
    // Split headers from body (first empty line)
    const headerBodySplit = raw.indexOf('\r\n\r\n');
    const headersPart = headerBodySplit > 0 ? raw.substring(0, headerBodySplit) : '';
    const bodyPart = headerBodySplit > 0 ? raw.substring(headerBodySplit + 4) : raw;

    // Decode subject from headers
    let subject = '';
    const subjectMatch = headersPart.match(/^Subject:\s*(.+?)(?:\r?\n(?!\s)|$)/mi);
    if (subjectMatch) {
        subject = decodeEmlHeader(subjectMatch[1].trim());
    }

    // Extract From header for insurance company detection
    let fromHeader = '';
    const fromMatch = headersPart.match(/^From:\s*(.+?)(?:\r?\n(?!\s)|$)/mi);
    if (fromMatch) {
        fromHeader = decodeEmlHeader(fromMatch[1].trim());
    }

    // Decode body: handle base64 and quoted-printable
    let bodyText = decodeEmlBody(bodyPart, headersPart);

    // Combine all text sources for extraction
    const combinedText = [subject, fromHeader, bodyText].join('\n');

    // Run enhanced extraction on the combined text
    const data = extractEmailDataEnhanced(combinedText, '');
    data.source = 'file';

    // If subject contains useful info, also try extracting from filename
    if (!data.detectedType) {
        const fnData = extractFromFileName(fileName);
        if (fnData.detectedType) data.detectedType = fnData.detectedType;
    }

    return data;
}

function decodeEmlHeader(header) {
    // Decode RFC 2047 encoded-words: =?charset?encoding?text?=
    return header.replace(/=\?([^?]+)\?(B|Q)\?([^?]+)\?=/gi, function(match, charset, encoding, text) {
        try {
            if (encoding.toUpperCase() === 'B') {
                // Base64
                return atob(text);
            } else {
                // Quoted-Printable
                return text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, function(m, hex) {
                    return String.fromCharCode(parseInt(hex, 16));
                });
            }
        } catch (e) {
            return text;
        }
    });
}

function decodeEmlBody(bodyPart, headersPart) {
    // Check Content-Transfer-Encoding
    const encodingMatch = headersPart.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const encoding = encodingMatch ? encodingMatch[1].toLowerCase() : '';

    // Check if multipart
    const boundaryMatch = headersPart.match(/boundary="?([^"\r\n;]+)"?/i);

    if (boundaryMatch) {
        // Multipart: extract text/plain part
        const boundary = boundaryMatch[1];
        const parts = bodyPart.split('--' + boundary);
        for (const part of parts) {
            if (part.includes('text/plain') || (!part.includes('text/html') && part.length > 50)) {
                // Get the body of this part (after headers)
                const partBodyIdx = part.indexOf('\r\n\r\n');
                if (partBodyIdx > 0) {
                    let partBody = part.substring(partBodyIdx + 4);
                    // Check part encoding
                    const partEncMatch = part.substring(0, partBodyIdx).match(/Content-Transfer-Encoding:\s*(\S+)/i);
                    const partEnc = partEncMatch ? partEncMatch[1].toLowerCase() : '';
                    partBody = decodeBodyContent(partBody, partEnc);
                    if (partBody.trim()) return partBody;
                }
            }
        }
    }

    // Single part
    return decodeBodyContent(bodyPart, encoding);
}

function decodeBodyContent(text, encoding) {
    try {
        if (encoding === 'base64') {
            // Remove line breaks and decode
            const cleaned = text.replace(/[\r\n\s]/g, '');
            // Try UTF-8 decode
            const bytes = atob(cleaned);
            try {
                return decodeURIComponent(escape(bytes));
            } catch (e) {
                return bytes;
            }
        } else if (encoding === 'quoted-printable') {
            return text
                .replace(/=\r?\n/g, '') // soft line breaks
                .replace(/=([0-9A-F]{2})/gi, function(m, hex) {
                    return String.fromCharCode(parseInt(hex, 16));
                });
        }
    } catch (e) {}
    return text;
}

function extractFromFileName(name) {
    // Try to extract info from the email file name
    // Outlook names files like "Subject.eml" or "Fw- Subject.eml"
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

    // Remove existing toast
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
    // Remove highlight when user focuses (starts editing)
    el.addEventListener('focus', function handler() {
        el.classList.remove('auto-filled');
        el.removeEventListener('focus', handler);
    });
}
