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
            let malformedLines = []; // Store malformed lines for debugging or logging
            let lines = ret.split('\n');

            for (let line of lines) {
                if (!line) continue;

                const sp = line.includes(',') ? line.split(',') : line.split('\t');  // Check for commas first, fall back to tabs
                console.log("Parsed line:", sp); // Log the parsed line

                // Process all lines, including malformed ones
                if (sp.length < 2 || sp[0].trim() === '') {
                    console.log("Malformed line detected:", sp);  // Log or flag malformed lines
                    malformedLines.push(line);  // Keep track of malformed lines
                }

                const [word, fieldStr] = sp;
                const fields = fieldStr.split(',');

                // If the fields don't match the expected number, log it as malformed but still process it
                if (fields.length !== 9) {
                    console.log(`Malformed line with incorrect number of fields: ${line}`);
                    malformedLines.push(line);  // Collect malformed lines here as well
                }

                // Process the line as a regular word entry even if it's malformed
                result.push({
                    word,
                    pos: fields[0] || "Unknown",  // Defaulting to "Unknown" if fields are missing
                    pos_detail1: fields[1] || "Unknown",
                    pos_detail2: fields[2] || "Unknown",
                    pos_detail3: fields[3] || "Unknown",
                    conjugation1: fields[4] || "Unknown",
                    conjugation2: fields[5] || "Unknown",
                    dictionary_form: fields[6] || "Unknown",
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
