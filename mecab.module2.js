import LoadMecab from "https://unpkg.com/mecab-wasm@1.0.2/lib/libmecab.js";

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

            let outLength = str.length * 128;
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
            let lines = ret.split('\n');

            for (let line of lines) {
                if (!line) continue;
            
                const sp = line.includes(',') ? line.split(',') : line.split('\t');  // Check for commas first, fall back to tabs
                console.log("Parsed line:", sp); // Log the parsed line
            
                // If the line doesn't have exactly 2 parts (word + fields), it might be a malformed line
                if (sp.length < 2) {
                    console.log("Skipping invalid line format:", sp);
                    const skippedWord = sp[0];
            
                    // If word is English, treat as skipped
                    if (/^[A-Za-z]+$/.test(skippedWord)) {
                        result.push({
                            word: skippedWord,
                            pos: "SKIPPED",
                            reading: skippedWord,
                            pronunciation: skippedWord
                        });
                    } else {
                        unrecognizedWords.push(skippedWord); // Add non-English word to unrecognized
                    }
                    continue;
                }
            
                const [word, fieldStr] = sp;
                const fields = fieldStr.split(',');
            
                if (fields.length === 9) {
                    result.push({
                        word,
                        pos: fields[0],
                        pos_detail1: fields[1],
                        pos_detail2: fields[2],
                        pos_detail3: fields[3],
                        conjugation1: fields[4],
                        conjugation2: fields[5],
                        dictionary_form: fields[6],
                        reading: fields[7],
                        pronunciation: fields[8]
                    });
                } else {
                    console.log(`Skipping invalid line format: ${line}`);
                }
            }


            resolve({ recognized: result, unrecognized: unrecognizedWords });
        });
    }
}

export default Mecab;
