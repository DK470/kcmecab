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
        // Ensure that the library is fully loaded and ready
        await libPromise;
        // Trigger an event once Mecab is loaded
        const event = new CustomEvent('mecabLoaded');
        document.dispatchEvent(event);
    }

    static query(str) {
    if (!instance) {
        throw new Error('Mecab not ready');
    }

    // Split input into Japanese and non-Japanese segments
    const segments = str.split(/([a-zA-Z\-.,!?"';:()\s]+)/).filter(segment => segment.trim() !== '');

    let results = [];
    for (const segment of segments) {
        if (/^[a-zA-Z\-.,!?"';:()\s]+$/.test(segment)) {
            // English or non-Japanese segment, add it directly to results
            results.push({
                word: segment,
                pos: 'foreign',
                dictionary_form: segment,
                reading: null,
                pronunciation: null
            });
            console.log(`Skipped Mecab for English word: "${segment}"`);
            continue;
        }

        // Process Japanese segment with MeCab
        let outLength = segment.length * 128; // Estimate size for the output buffer
        let outArr = lib._malloc(outLength);
        let ret = lib.ccall(
            'mecab_sparse_tostr3', 'number',
            ['number', 'string', 'number', 'number', 'number'],
            [instance, segment, lib.lengthBytesUTF8(segment) + 1, outArr, outLength]
        );
        ret = lib.UTF8ToString(ret);
        lib._free(outArr);

        if (!ret) {
            console.error(`Mecab failed for input segment: "${segment}"`);
            continue;
        }

        // Parse Mecab output and merge results
        const parsedSegment = ret.split('\n').map(line => {
            const sp = line.split('\t');
            if (sp.length !== 2) return null;
            const [word, fieldStr] = sp;
            const fields = fieldStr.split(',');
            return fields.length === 9 ? {
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
            } : null;
        }).filter(Boolean);

        results = results.concat(parsedSegment);
    }

    return results;
}

export default Mecab;
