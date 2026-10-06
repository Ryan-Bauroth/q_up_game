export class Node {
    constructor({id = 0, summary = "", charges = 0, abilities = [], locked = false, required = true} = {}) {
        this.id = id;
        // locked pieces start on the board and can't be moved or replaced
        this.locked = locked;
        // a piece that isn't required can be left unactivated without losing the
        // game (hand pieces); it still fires once if something hits it
        this.required = required;
        this.summary = summary;
        this.maxCharges = charges;
        this.charges = charges;
        // array of ability ids, resolved against the catalog in abilities.js
        this.abilities = abilities;
    }

    get isEmpty() {
        return this.id === 0;
    }

    get isDepleted() {
        return this.charges <= 0;
    }

    // Consumes one charge if available. Returns true if it actually fired,
    // false if it absorbed harmlessly (empty cell or already depleted).
    activate() {
        if (this.isEmpty) return false;
        if (this.charges <= 0) {
            this.charges = 0;
            return false;
        }
        this.charges -= 1;
        return true;
    }

    clone() {
        return new Node({id: this.id, summary: this.summary, charges: this.maxCharges, abilities: [...this.abilities], locked: this.locked, required: this.required});
    }
}

export function makeEmptyNode() {
    return new Node({id: 0, summary: "", charges: 0, abilities: []});
}
