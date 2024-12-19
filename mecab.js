import LoadMecab from "file:///android_asset/libmecab.js";

// Function to locate files
function locateFile(fn) {
    switch(fn) {
        case 'libmecab.data':
            return "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.data"; // Online libmecab.data file
        case 'libmecab.wasm':
            return "file:///android_asset/libmecab.wasm"; // Local path for wasm file
        default:
            return null; // Fallback for other files if necessary
    }
}

let lib;
let instance;

// Promise for loading the Mecab library and data
let libPromise = Promise.all([
    LoadMecab({ locateFile }),
    loadFile('libmecab.data') // Fetching libmecab.data file
]).then(([loadedLib, dataFile]) => {
    lib = loadedLib;
    // Initialize Mecab instance after loading
    instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
    console.log("Mecab has been successfully initialized!");

    // Dispatch a custom event to signal completion
    document.dispatchEvent(new CustomEvent('mecabReady'));
}).catch((error) => {
    console.error("Failed to load Mecab:", error);
});

// Function to load files (with caching)
async function loadFile(fileUrl) {
    const cachedFile = await checkCache(fileUrl);
    if (cachedFile) {
        return cachedFile;
    }

    const response = await fetch(fileUrl);
    const fileData = await response.arrayBuffer();
    storeInCache(fileUrl, fileData);
    return fileData;
}

// Cache management: checking if the file is cached
async function checkCache(fileUrl) {
    // Replace with actual cache checking logic (e.g., IndexedDB, LocalStorage, etc.)
    return null; // For now, returning null for simplicity
}

// Cache management: storing the file in cache
async function storeInCache(fileUrl, data) {
    // Implement caching logic (e.g., IndexedDB, LocalStorage, etc.)
    console.log(`Storing file in cache: ${fileUrl}`);
}

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

        // Allocate memory for the query string
        let outLength = str.length * 128;
        let outArr = lib._malloc(outLength);
        let result = [];

        try {
            // Perform query operation on the Mecab instance
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
