import LoadMecab from "https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.js"; 

function locateFile(fn) {
    let url = '';
    if (fn === 'libmecab.data') {
        url = 'https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.data';
    } else if (fn === 'libmecab.wasm') {
        url = 'https://unpkg.com/mecab-wasm@1.0.3/lib/libmecab.wasm';
    } else {
        return fn;  // Return the default file if it's neither of the two
    }

    console.log(`Loading ${fn} from: ${url}`);
    return url;  // Ensure the correct URL is returned
}


var lib;
var instance;
const libPromise = LoadMecab({ locateFile });
libPromise.then(x => { 
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
                                 [instance, str, lib.lengthBytesUTF8(str)+1, out_arr, out_length]);
        ret = lib.UTF8ToString(ret);
        lib._free(out_arr);

        if (ret.length == 0) {
            console.log(`Mecab failed with string "${str}"`);
            return [];
        }

        let result = []
        for (let line of ret.split('\n')) {
            const sp = line.split('\t');
            if (sp.length != 2) continue;

            const [ word, field_str ] = sp;
            // 品詞, 品詞細分類1, 品詞細分類2, 品詞細分類3, 活用形1, 活用形2, 原形, 読み, 発音
            const [ pos, pos_detail1, pos_detail2, pos_detail3, conjugation1, conjugation2, dictionary_form, reading, pronunciation ] = field_str.split(',');
            result[result.length] = { word, pos, pos_detail1, pos_detail2, pos_detail3, conjugation1, conjugation2, dictionary_form, reading, pronunciation };
        }

        return result;
    }
}

export default Mecab;
