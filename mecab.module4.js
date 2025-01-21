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
let wasmLoaded = false;
let dataLoaded = false;
let isMeCabLoaded = false;
let libPromise = LoadMecab({ locateFile });

// Initialize MeCab
function initializeMeCab() {
    libPromise.then((loadedLib) => {
        lib = loadedLib;
        instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
        if (instance) {
            console.log("MeCab initialized! Instance:", instance);
            isMeCabLoaded = true;
            wasmLoaded = true; // Mark wasm as loaded
            dataLoaded = true; // Mark data as loaded
            document.dispatchEvent(new CustomEvent('mecabReady'));
        } else {
            throw new Error("Failed to create MeCab instance");
        }
    }).catch((error) => {
        console.error("Failed to load MeCab:", error);
        showErrorMessage("Failed to load MeCab. Please try again.");
        retryLoadMissingParts();
    });
}

// Retry loading missing parts of MeCab (either wasm or data)
function retryLoadMissingParts() {
    if (!wasmLoaded || !dataLoaded) {
        if (!wasmLoaded) {
            console.log("Retrying to load libmecab.wasm...");
        }
        if (!dataLoaded) {
            console.log("Retrying to load libmecab.data...");
        }

        libPromise = LoadMecab({ locateFile })
            .then((loadedLib) => {
                lib = loadedLib;
                instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
                if (instance) {
                    console.log("MeCab instance created successfully.");
                    isMeCabLoaded = true;
                    wasmLoaded = true; // Mark wasm as loaded
                    dataLoaded = true; // Mark data as loaded
                    document.dispatchEvent(new CustomEvent('mecabReady'));
                    return;
                } else {
                    throw new Error("Failed to create MeCab instance after retrying");
                }
            })
            .catch((error) => {
                console.error("Error during retry:", error);
                showErrorMessage("Failed to load MeCab components. Retrying...");
                setTimeout(retryLoadMissingParts, 20000); // Retry after a delay
            });
    }
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
    }, 20000); // Automatically hide after 20 seconds
}

// Class to interact with MeCab
class Mecab {
    static async waitReady() {
        if (!isMeCabLoaded) {
            await libPromise; // Wait for MeCab to load if not already loaded
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

            let outArr = lib._malloc(outLength); // Allocate memory for output
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

                    // Normalize conjugated verbs to their dictionary form
                    entry.dictionary_form = normalizeConjugatedForm(entry.word, entry.dictionary_form);

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

// Normalize conjugated verbs to their dictionary form
function normalizeConjugatedForm(word, dictionaryForm) {
    // Apply basic conjugation normalization if the word is a verb
    if (isConjugatedForm(word)) {
        return getBaseFormFromConjugated(word, dictionaryForm);
    }
    return dictionaryForm; // Return the dictionary form if not conjugated
}

// Check if a word is conjugated (basic heuristic for common verb endings)
function isConjugatedForm(word) {
    // Basic check for common verb endings in conjugated forms
    const conjugationSuffixes = ['れ', 'て', 'た', 'ます', 'う', 'る'];
    return conjugationSuffixes.some(suffix => word.endsWith(suffix));
}

// Convert conjugated forms to their dictionary form (e.g., "作れ" -> "作る")
function getBaseFormFromConjugated(conjugatedWord, dictionaryForm) {
    if (conjugatedWord.endsWith('れ')) {
        return dictionaryForm.replace('れ', 'る');  // "作れ" -> "作る"
    }
    if (conjugatedWord.endsWith('て')) {
        return dictionaryForm.replace('て', 'る');  // "食べて" -> "食べる"
    }
    if (conjugatedWord.endsWith('た')) {
        return dictionaryForm.replace('た', 'る');  // "食べた" -> "食べる"
    }
    // More rules can be added for other verb conjugations (like 'ます', 'う' endings, etc.)
    return dictionaryForm;  // Return dictionary form if no transformation is needed
}


// Initialize MeCab on script load
initializeMeCab();

export default Mecab;
