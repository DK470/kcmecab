import LoadMecab from "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.js";

// Efficient file locator
function locateFile(fn) {
    switch(fn) {
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

libPromise.then((loadedLib) => {
    lib = loadedLib;
    instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
    console.log("Mecab initialized! Instance:", instance);

    document.dispatchEvent(new CustomEvent('mecabReady'));
}).catch((error) => {
    console.error("Failed to load Mecab:", error);
});

class Mecab {
    static async waitReady() {
        await libPromise;
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
