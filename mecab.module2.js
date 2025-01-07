import LoadMecab from "https://unpkg.com/mecab-wasm@1.0.2/lib/libmecab.js";

// Efficient file locator
function locateFile(fn) {
    // Handle the wasm and data file paths separately
    switch(fn) {
        case 'libmecab.data':
            return "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.data";  // Online libmecab.data file
        case 'libmecab.wasm':
            return "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.wasm";  // Local path for wasm file
        default:
            return null; // Fallback for other files if necessary
    }
}

let lib;
let instance;
let libPromise = LoadMecab({ locateFile });

// Ensure Mecab is ready asynchronously
libPromise.then((loadedLib) => {
    lib = loadedLib;
    // Initialize Mecab instance after loading
    instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
    console.log("Mecab has been successfully initialized!");

    // Dispatch a custom event to signal completion
    document.dispatchEvent(new CustomEvent('mecabReady'));
}).catch((error) => {
    console.error("Failed to load Mecab:", error);
});

class Mecab {
    static async waitReady() {
        await libPromise;
        const event = new CustomEvent('mecabLoaded');
        document.dispatchEvent(event);
    }

    static query(str) {
        return new Promise((resolve, reject) => {
            if (!instance) {
                reject(new Error('Mecab not ready'));
                return;
            }

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
                console.error(`Mecab failed for input string: "${str}"`);
                resolve({ recognized: [], unrecognized: [str] }); // Return the original input as unrecognized
            }

            let result = [];
            let unrecognizedWords = [];
            let lines = ret.split('\n');

            for (let line of lines) {
                if (!line) continue;

                const sp = line.split('\t');

                if (sp.length !== 2) {
                    const skippedWord = sp[0];

                    // Check if the word consists only of English characters
                    if (/^[A-Za-z]+$/.test(skippedWord)) {
                        result.push({
                            word: skippedWord,
                            pos: "SKIPPED",  // You can customize this further as needed
                            reading: skippedWord,
                            pronunciation: skippedWord
                        });
                    } else {
                        unrecognizedWords.push(skippedWord); // Add to unrecognized words
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
                }
            }

            resolve({ recognized: result, unrecognized: unrecognizedWords });
        });
    }
}

export default Mecab;
