import LoadMecab from "https://unpkg.com/browse/mecab-wasm@1.0.3/lib/libmecab.js";

function locateFile(fn) {
    if (fn === 'libmecab.data') {
        // Load the data file from the remote CMS
        return 'https://unpkg.com/browse/mecab-wasm@1.0.3/lib/libmecab.data';
    }
    if (fn === 'libmecab.wasm') {
        // Load the WASM file from the app's local assets
        return '/assets/libmecab.wasm'; 
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
        await libPromise; // Ensure the library is fully loaded before proceeding
        // Trigger the 'mecabLoaded' event to notify when the library is ready
        document.dispatchEvent(new CustomEvent('mecabLoaded'));
    }

    static query(str) {
        if (!instance) {
            console.error('Mecab not ready');
            return [];
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
            return [];
        }

        return result;
    }
}

export default Mecab;
