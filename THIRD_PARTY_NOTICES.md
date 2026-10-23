# Third-party notices and reuse scope

This repository makes the Code / Choice application and its frozen comparison assets
publicly inspectable. No blanket license for original application code, generated
outputs or Study responses is added by changing repository visibility. Third-party
material retains its own terms. Operational responses and databases are excluded.

## Benchmark prompts

The frozen pools and output catalog contain prompts from OpenAI HumanEval, obtained
through the `evalplus/humanevalplus` dataset. OpenAI HumanEval is MIT licensed; the
copyright and complete permission notice are retained in
[licenses/HumanEval-MIT.txt](public/licenses/HumanEval-MIT.txt), from the
[official HumanEval license](https://github.com/openai/human-eval/blob/master/LICENSE).

The [HumanEval+ dataset card](https://huggingface.co/datasets/evalplus/humanevalplus)
declares Apache 2.0. The complete EvalPlus license, including its HumanEval notice,
is retained in [licenses/EvalPlus-Apache-2.0.txt](public/licenses/EvalPlus-Apache-2.0.txt),
from the [official EvalPlus license](https://github.com/evalplus/evalplus/blob/master/LICENSE).
Historical immutable dataset revisions were not recovered; source hashes and this
limitation remain in the frozen provenance. The benchmark fragments are embedded
in comparison wrappers; these notices do not claim ownership of those fragments.

## Generated code and model references

The frozen code samples are saved research generations, not newly generated or
handwritten reference solutions. Their source runs, model identifiers, correctness
metadata and hashes remain in `researcher/` and the frozen assets. Formal records
name `unsloth/Qwen3.6-27B`; Judge configuration names
`Qwen2.5-32B-Instruct-AWQ`. No model weights, adapters or training archives are
distributed here. Inclusion of outputs is not an unrestricted downstream-training
or model-weight license. Consult the relevant upstream terms for reuse.

## Application dependencies

React, Vite, TypeScript, Shiki and test/build dependencies are installed through npm
and retain their upstream licenses. `package-lock.json` records dependency versions
and license metadata; installed packages include their own notices. The repository
does not vendor their installations or publish `node_modules/` or `dist/`.
