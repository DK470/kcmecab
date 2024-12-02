import LoadMecab from "./libmecab.js";

function locateFile(fn) {
    if (fn === 'libmecab.data') {
        // Specify the full URL to fetch libmecab.data
        return "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.data";
    }
    if (fn === 'libmecab.wasm') {
        // Modify if needed for the correct URL for the WASM file
        return new URL('libmecab.wasm', import.meta.url).toString();
    }
}

let lib;
let instance;
const libPromise = LoadMecab({ locateFile });

libPromise.then((x) => {
    lib = x;
    instance = lib.ccall('mecab_new2', 'number', ['string'], ['']);
});

class Mecab {
    static async waitReady() {
        await libPromise;
    }

    static query(str) {
        if (instance == null) {
            throw 'Mecab not ready';
        }

        let out_length = str.length * 128;

        let out_arr = lib._malloc(out_length);
        let ret = lib.ccall('mecab_sparse_tostr3', 'number', ['number', 'string', 'number', 'number', 'number'],
            [instance, str, lib.lengthBytesUTF8(str) + 1, out_arr, out_length]);
        ret = lib.UTF8ToString(ret);
        lib._free(out_arr);

        if (ret.length === 0) {
            console.log(`Mecab failed with string "${str}"`);
            return [];
        }

        let result = [];
        for (let line of ret.split('\n')) {
            const sp = line.split('\t');
            if (sp.length !== 2) continue;

            const [word, field_str] = sp;
            const [pos, pos_detail1, pos_detail2, pos_detail3, conjugation1, conjugation2, dictionary_form, reading, pronunciation] = field_str.split(',');
            result.push({ word, pos, pos_detail1, pos_detail2, pos_detail3, conjugation1, conjugation2, dictionary_form, reading, pronunciation });
        }

        return result;
    }
}

export default Mecab;
