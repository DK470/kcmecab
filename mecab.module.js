import LoadMecab from "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.js";

function locateFile(fn) {
    switch (fn) {
        case 'libmecab.data':
            return "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.data";
        case 'libmecab.wasm':
            return "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.wasm";
        default:
            return null;
    }
}

let lib;
let instance;
let libPromise = LoadMecab({ locateFile });
let isMeCabLoaded = false;

// Initialize MeCab
function initializeMeCab() {
    libPromise.then((loadedLib) => {
        lib = loadedLib;
        instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
        if (instance) {
            console.log("MeCab initialized! Instance:", instance);
            isMeCabLoaded = true;
            document.dispatchEvent(new CustomEvent('mecabReady'));
        } else {
            throw new Error("Failed to create MeCab instance");
        }
    }).catch((error) => {
        console.error("Failed to load MeCab:", error);
        showErrorMessage("Failed to load MeCab. Please try again.");
    });
}

// Retry MeCab Initialization
function retryLoadMecab() {
    if (instance) {
        try {
            lib.ccall('mecab_destroy', null, ['number'], [instance]); // Cleanup
        } catch (err) {
            console.warn("Failed to destroy existing MeCab instance:", err);
        }
    }
    isMeCabLoaded = false;
    libPromise = LoadMecab({ locateFile }); // Reload MeCab
    initializeMeCab();
}

// Error message display
function showErrorMessage(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    setTimeout(() => {
        if (errorElement) errorElement.style.display = 'none';
    }, 5000); // Automatically hide after 5 seconds
}

// Class to interact with MeCab
class Mecab {
    static async waitReady() {
        if (!isMeCabLoaded) {
            await libPromise;
            document.dispatchEvent(new CustomEvent('mecabLoaded'));
        }
    }

    static query(str) {
        return new Promise((resolve, reject) => {
            if (!instance) {
                reject(new Error('MeCab not ready'));
                return;
            }

            console.log("Processing string:", str);

            const estimatedTokens = Math.max(10, Math.ceil(str.length / 3));
            const outLength = estimatedTokens * 512;

            let outArr = lib._malloc(outLength); // Allocate memory
            let ret;

            try {
                ret = lib.ccall(
                    'mecab_sparse_tostr3', 'number',
                    ['number', 'string', 'number', 'number', 'number'],
                    [instance, str, lib.lengthBytesUTF8(str) + 1, outArr, outLength]
                );

                ret = lib.UTF8ToString(ret);
                if (!ret) {
                    throw new Error(`MeCab failed for input: "${str}"`);
                }

                console.log("Raw MeCab Result:", ret);

                let result = [];
                let malformedLines = [];
                let unrecognizedWords = [];
                let lines = ret.split('\n');

                for (let line of lines) {
                    if (!line.trim()) continue; // Skip empty lines

                    const sp = line.split('\t');
                    if (sp.length < 2) {
                        malformedLines.push(line); // Track malformed lines
                        continue;
                    }

                    const word = sp[0];
                    const fields = sp[1].split(',');

                    const entry = {
                        word,
                        pos: fields[0] || "Unknown",
                        pos_detail1: fields[1] || "Unknown",
                        pos_detail2: fields[2] || "Unknown",
                        pos_detail3: fields[3] || "Unknown",
                        conjugation1: fields[4] || "Unknown",
                        conjugation2: fields[5] || "Unknown",
                        dictionary_form: fields[6] || word,
                        reading: fields[7] || "Unknown",
                        pronunciation: fields[8] || "Unknown"
                    };

                    result.push(entry);
                }

                if (malformedLines.length > 0) {
                    console.warn("Malformed Lines Detected:", malformedLines);
                }

                if (result.length === 0) {
                    console.error("MeCab results are empty or invalid!");
                    resolve({ recognized: [], unrecognized: [str] }); // Return the input as unrecognized
                    return;
                }

                resolve({ recognized: result, unrecognized: unrecognizedWords });
            } catch (error) {
                console.error("MeCab query error:", error);
                reject(error);
            } finally {
                lib._free(outArr); // Free allocated memory
            }
        });
    }
}

// Initialize MeCab on script load
initializeMeCab();

export default Mecab;
