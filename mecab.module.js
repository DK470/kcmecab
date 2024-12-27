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

    // Preprocess the text to ensure numbers and symbols are treated correctly
    const preprocessedText = preprocessText(str);

    let outLength = preprocessedText.length * 128; // Estimate size for the output buffer
    let outArr = lib._malloc(outLength);
    
    // Call the Mecab parsing function with the preprocessed text
    let ret = lib.ccall(
        'mecab_sparse_tostr3', 'number', 
        ['number', 'string', 'number', 'number', 'number'], 
        [instance, preprocessedText, lib.lengthBytesUTF8(preprocessedText) + 1, outArr, outLength]
    );
    ret = lib.UTF8ToString(ret); // Convert result to a readable string
    lib._free(outArr);

    if (!ret) {
        console.error(`Mecab failed for input string: "${preprocessedText}"`);
        return [];
    }

    // Process the output into a structured format
    let result = ret.split('\n').map(line => {
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

    return result;
}

// Preprocess function to handle numbers and symbols
function preprocessText(input) {
    // Ensure numbers and symbols are isolated to avoid being skipped
    return input.replace(/([0-9!-/:-@[-`{-~])/g, ' $1 '); // Add spaces around numbers/symbols
}


export default Mecab;
