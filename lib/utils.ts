/**
 * Masks CPF (000.000.000-00)
 */
export const maskCPF = (value: string) => {
    return value
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
};

/**
 * Masks CNPJ (00.000.000/0000-00)
 */
export const maskCNPJ = (value: string) => {
    return value
        .replace(/\D/g, '')
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
};

/**
 * Validates CPF
 */
export const isValidCPF = (cpf: string): boolean => {
    const cleanCPF = cpf.replace(/\D/g, '');
    if (cleanCPF.length !== 11 || !!cleanCPF.match(/(\d)\1{10}/)) return false;

    const digits = cleanCPF.split('').map(el => +el);
    const rest = (count: number) => (
        digits
            .slice(0, count - 12)
            .reduce((soma, el, index) => soma + el * (count - index), 0) *
        10
    ) % 11 % 10;

    return rest(10) === digits[9] && rest(11) === digits[10];
};

/**
 * Validates CNPJ
 */
export const isValidCNPJ = (cnpj: string): boolean => {
    const cleanCNPJ = cnpj.replace(/\D/g, '');
    if (cleanCNPJ.length !== 14 || !!cleanCNPJ.match(/(\d)\1{13}/)) return false;

    const size = cleanCNPJ.length - 2;
    const numbers = cleanCNPJ.substring(0, size);
    const digits = cleanCNPJ.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
        sum += Number(numbers.charAt(size - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== Number(digits.charAt(0))) return false;

    const size2 = size + 1;
    const numbers2 = cleanCNPJ.substring(0, size2);
    sum = 0;
    pos = size2 - 7;
    for (let i = size2; i >= 1; i--) {
        sum += Number(numbers2.charAt(size2 - i)) * pos--;
        if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === Number(digits.charAt(1));
};
