export class Node {
    constructor(id = 0, summary = "", charges = 0, activations = [], abilities = []){
        this.id = id;
        this.summary = summary;
        this.charges = charges;
        // array of directions ie: [{x: 0, y: -1}, {x: 1, y: 0}]
        // => node below this node and node to the right of this node
        this.activations = activations;
        // array of ability ids
        this.abilities = abilities;
    }

    run(x, y){
        this.charges = this.charges - 1;
        let activated_nodes = this.calculate_activations(x, y);
        return {
            activated_nodes: activated_nodes,
            abilities: this.abilities
        };
    }

    calculate_activations(x, y){
        let arr = []
        for(const activation of this.activations){
            arr.append([x + activation.x, y + activation.y]);
        }
        return arr;
    }
}