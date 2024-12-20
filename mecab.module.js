import LoadMecab from "file:///android_asset/libmecab.js";

// Efficient file locator
function locateFile(fn) {
    const baseURL = "https://unpkg.com/mecab-wasm@1.0.3/lib/";
    return fn === 'libmecab.data' || fn === 'libmecab.wasm' ? baseURL + fn : null;
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

    // Dispatch a custom event to signal completion (only dispatch 'mecabReady')
    document.dispatchEvent(new CustomEvent('mecabReady'));
}).catch((error) => {
    console.error("Failed to load Mecab:", error);
});


// Mecab class for interacting with the library
class Mecab {
    static async waitReady() {
        // Ensure that the library is fully loaded and ready
        await libPromise;
    }

    static query(str) {
        if (!instance) {
            throw new Error('Mecab not ready');
        }

        // Optimized buffer size estimation
        const outLength = str.length * 2; // Use 2 bytes per character for UTF-8
        const outArr = lib._malloc(outLength);
        
        // Call the Mecab parsing function
        const ret = lib.ccall(
            'mecab_sparse_tostr3', 'number',
            ['number', 'string', 'number', 'number', 'number'],
            [instance, str, lib.lengthBytesUTF8(str) + 1, outArr, outLength]
        );
        const result = lib.UTF8ToString(ret); // Convert result to a readable string
        lib._free(outArr);

        if (!result) {
            console.error(`Mecab failed for input string: "${str}"`);
            return [];
        }

        // Process the output into a structured format with reduced operations
        return result.split('\n').reduce((acc, line) => {
            const [word, fieldStr] = line.split('\t');
            if (!word || !fieldStr) return acc; // Skip invalid lines

            const fields = fieldStr.split(',');
            if (fields.length !== 9) return acc; // Skip invalid field lengths

            acc.push({
                word,
                pos: fields[0],
                pos_detail1: fields[1],
                pos_detail2: fields[2],
                pos_detail3: fields[3],
                conjugation1: fields[4],
                conjugation2: fields[5],
                dictionary_form: fields[6],
                reading: fields[7],
                pronunciation: fields[8],
            });
            return acc;
        }, []);
    }
}

export default Mecab;
