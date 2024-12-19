import LoadMecab from "file:///android_asset/libmecab.js";

function locateFile(fn) {
    if (fn == 'libmecab.data') {
        return new URL('libmecab.data', import.meta.url).toString();
    }
    if (fn == 'libmecab.wasm') {
        return new URL('libmecab.wasm', import.meta.url).toString();
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

// Mecab class for interacting with the library
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

        let outLength = str.length * 128;
        let outArr = lib._malloc(outLength);
        let result = [];

        try {
            let ret = lib.ccall('mecab_sparse_tostr3', 'number', ['number', 'string', 'number', 'number', 'number'], 
                                 [instance, str, lib.lengthBytesUTF8(str) + 1, outArr, outLength]);
            if (!ret) {
                console.error("Mecab returned no result for input string.");
                return [];
            }

            ret = lib.UTF8ToString(ret);
            lib._free(outArr);

            if (!ret.trim()) {
                console.error("Mecab failed to parse the string properly.");
                return [];
            }

            // Process the result
            result = ret.split('\n').map(line => {
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

        } catch (error) {
            console.error("Error during query processing:", error);
        }

        return result;
    }
}

export default Mecab;
