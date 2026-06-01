# Fixture: a documented LLM package-hallucination on PyPI.
# "huggingface-cli" is a name LLMs hallucinate in place of "huggingface-hub".
# Expected: exactly one SlopsquattingRisk smell (corpus hit).
import huggingface_cli

token = huggingface_cli.login()
