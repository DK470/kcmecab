let lib;
let instance;
let libPromise = LoadMecab({ locateFile });

libPromise.then((loadedLib) => {
    lib = loadedLib;
    // Initialize Mecab instance after loading
    instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
    console.log("Mecab has been successfully initialized!");
    
    hideProgressBar(); // Hide the progress bar when Mecab is fully initialized
}).catch((error) => {
    console.error("Failed to load Mecab:", error);
    hideProgressBar(); // Hide the progress bar if Mecab fails to load
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

        let outLength = str.length * 128; // Estimate size for the output buffer
        let outArr = lib._malloc(outLength);
        // Call the Mecab parsing function
        let ret = lib.ccall(
            'mecab_sparse_tostr3', 'number', 
            ['number', 'string', 'number', 'number', 'number'], 
            [instance, str, lib.lengthBytesUTF8(str) + 1, outArr, outLength]
        );
        ret = lib.UTF8ToString(ret); // Convert result to a readable string
        lib._free(outArr);

        if (!ret) {
            console.error(`Mecab failed for input string: "${str}"`);
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
}
