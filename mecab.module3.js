import LoadMecab from "https://unpkg.com/mecab-wasm@1.0.2/lib/libmecab.js";

// Retry logic for fetching files
async function retryFetch(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.url; // Return the URL on success
        } catch (error) {
            console.warn(`Retry ${i + 1}/${retries} failed for ${url}:`, error);
            if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

// Preload and cache required files
const preloadedFiles = {};
let libPromise; // Define libPromise globally
let lib;
let instance;

async function preloadFiles() {
    const baseUrl = "https://unpkg.com/mecab-wasm@1.0.3/lib/";
    const files = {
        'libmecab.data': `${baseUrl}libmecab.data`,
        'libmecab.wasm': `${baseUrl}libmecab.wasm`,
    };

    for (const [key, url] of Object.entries(files)) {
        try {
            preloadedFiles[key] = await retryFetch(url, 3, 2000);
            console.log(`Preloaded: ${key}`);
        } catch (error) {
            console.error(`Failed to preload ${key}:`, error);
            throw error;
        }
    }
}

// Efficient file locator
function locateFile(fn) {
    if (preloadedFiles[fn]) {
        return preloadedFiles[fn]; // Return the preloaded URL
    } else {
        console.error(`File not preloaded: ${fn}`);
        throw new Error(`Missing preloaded file: ${fn}`);
    }
}

// Initialize Mecab asynchronously
(async () => {
    try {
        // Preload required files
        await preloadFiles();

        // Initialize Mecab and assign libPromise
        libPromise = LoadMecab({ locateFile });

        libPromise.then((loadedLib) => {
            lib = loadedLib;
            instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
            console.log("Mecab initialized! Instance:", instance);

            document.dispatchEvent(new CustomEvent('mecabReady'));
        }).catch((error) => {
            console.error("Failed to load Mecab:", error);
        });
    } catch (error) {
        console.error("Error during initialization:", error);
    }
})();

class Mecab {
    static async waitReady() {
        await libPromise; // Use the globally defined libPromise
        document.dispatchEvent(new CustomEvent('mecabLoaded'));
    }

    static query(str) {
        return new Promise((resolve, reject) => {
            if (!instance) {
                reject(new Error('Mecab not ready'));
                return;
            }

            console.log("Processing string:", str);

            // Estimate output size based on input length
            const estimatedTokens = Math.ceil(str.length / 3); // Assume 1 token per 3 characters (rough estimate)
            const outLength = estimatedTokens * 512; // 512 bytes per token (adjustable)

            // Dynamically allocate memory based on the estimated output size
            let outArr = lib._malloc(outLength);

            let ret = lib.ccall(
                'mecab_sparse_tostr3', 'number',
                ['number', 'string', 'number', 'number', 'number'],
                [instance, str, lib.lengthBytesUTF8(str) + 1, outArr, outLength]
            );

            ret = lib.UTF8ToString(ret);
            lib._free(outArr);

            if (!ret) {
                console.error(`Mecab failed for input: "${str}"`);
                resolve({ recognized: [], unrecognized: [str] });
                return;
            }

            console.log("Mecab Result:", ret);

            let result = [];
            let unrecognizedWords = [];
            let malformedLines = []; // Store malformed lines for debugging or logging
            let lines = ret.split('\n');

            for (let line of lines) {
                if (!line) continue;

                const sp = line.split('\t');
                if (sp.length < 1) continue; // Skip completely malformed lines

                const word = sp[0]; // Always take the word, even if fields are missing
                const fieldStr = sp[1] || ''; // Default to an empty string if fields are missing
                const fields = fieldStr.split(',');

                // Create the result object with default values for missing fields
                result.push({
                    word,
                    pos: fields[0] || "Unknown",
                    pos_detail1: fields[1] || "Unknown",
                    pos_detail2: fields[2] || "Unknown",
                    pos_detail3: fields[3] || "Unknown",
                    conjugation1: fields[4] || "Unknown",
                    conjugation2: fields[5] || "Unknown",
                    dictionary_form: fields[6] || word, // Default to the word itself if blank
                    reading: fields[7] || "Unknown",
                    pronunciation: fields[8] || "Unknown"
                });
            }

            console.log("Malformed Lines:", malformedLines);  // Output all malformed lines for debugging
            resolve({ recognized: result, unrecognized: unrecognizedWords });
        });
    }
}

export default Mecab;
