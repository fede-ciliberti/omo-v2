# Archived omo config (2026-11-17)

**Status:** archived snapshot. Not a template, and read by no code.

This is the verbatim content of `~/.omo/omo.jsonc` on one machine, removed on
2026-11-17 after the V2 TUI sidebar stopped rendering a model roster (see
[`packages/omo-opencode/src/features/tui-sidebar/AGENTS.md`](../../packages/omo-opencode/src/features/tui-sidebar/AGENTS.md)).

## Why it was kept

Two things in it exist nowhere else and were tuned by hand:

- the per-agent **`fallback_models` chains**: each fallback carries its own model and
  reasoning level, and no other file on the machine records them;
- the V1 **category roster** (`deep-high`, `ultrabrain`, `artistry`, ...), which the V2 port
  does not implement.

Runtime models do not come from this file. The host resolves them from
`~/.config/opencode/opencode.json`: `agents.<id>.model`, with the top-level `model` and
`small_model` as defaults. Nothing in this repository reads this snapshot.

## What it carried

| Block | Content | Read by V2 |
|---|---|---|
| `agents` | 11 agents, each with `model`, `reasoning`, `fallback_models` | no; the removed sidebar roster was the only reader |
| `categories` | 8 V1 routing categories (rendered as 9 sidebar rows) | no; V2 has no category routing |
| `background_task` | 4 timeouts | no |
| `disabled_hooks` | `model-fallback`, `session-notification` | no |
| `runtime_fallback` | `true` | no |

## Verbatim content

```jsonc
// OMO configuration
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/assets/omo.schema.json",
  "[opencode]": {
    "runtime_fallback": true,
    "disabled_hooks": ["model-fallback", "session-notification"],
    "agents": {
      "sisyphus": {
        "model": "litellm/muse-spark-1.3-contributor",
        "fallback_models": [
          "litellm/deepseek-v4.1-flash"
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "oracle": {
        "model": "litellm/muse-spark-1.3-contributor",
        "reasoning": "xhigh",
        "fallback_models": [
          {
            "model": "litellm/deepseek-v4.1-flash",
            "reasoning": "high"
          }
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "librarian": {
        "model": "litellm/deepseek-v4.1-flash",
        "reasoning": "minimal",
        "fallback_models": [
          {
            "model": "litellm/gemini-3.1-flash-lite",
            "reasoning": "max"
          }
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "explore": {
        "model": "litellm/deepseek-v4.1-flash",
        "reasoning": "minimal",
        "fallback_models": [
          "litellm/deepseek-v4.1-flash"
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "multimodal-looker": {
        "model": "litellm/muse-spark-1.3-contributor",
        "reasoning": "minimal",
        "fallback_models": [
          {
            "model": "litellm/glm-5.3-flash",
            "reasoning": "minimal"
          }
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "prometheus": {
        "model": "litellm/gemini-3.8-flash",
        "fallback_models": [
          "litellm/gemini-3.6-flash",
          "litellm/glm-5.1"
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "metis": {
        "model": "litellm/gemini-3.8-flash",
        "reasoning": "high",
        "fallback_models": [
          "litellm/muse-spark-1.3-contributor",
          "litellm/kimi-k2.7-code"
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "momus": {
        "model": "litellm/muse-spark-1.3-contributor",
        "reasoning": "high",
        "fallback_models": [
          {
            "model": "litellm/deepseek-v4.1-flash",
            "reasoning": "xhigh"
          }
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "atlas": {
        "model": "litellm/deepseek-v4.1-flash",
        "reasoning": "minimal",
        "fallback_models": [
          {
            "model": "litellm/muse-spark-1.3-contributor",
            "reasoning": "low"
          }
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      },
      "hephaestus": {
        "model": "litellm/glm-5.2",
        "fallback_models": [
          "litellm/glm-5.1"
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        },
        "allow_non_gpt_model": true
      },
      "sisyphus-junior": {
        "model": "litellm/deepseek-v4.1-flash",
        "fallback_models": [
          "litellm/gemini-3.5-flash-lite"
        ],
        "compaction": {
          "model": "litellm/deepseek-v4.1-flash"
        }
      }
    },
    "categories": {
      "visual-engineering": {
        "model": "litellm/kimi-k2.7-code",
        "reasoning": "high",
        "fallback_models": [
          "litellm/gemini-3.7-flash"
        ]
      },
      "ultrabrain": {
        "model": "litellm/muse-spark-1.3-contributor",
        "reasoning": "xhigh",
        "fallback_models": [
          "litellm/glm-5.3-flash"
        ]
      },
      "artistry": {
        "model": "litellm/kimi-k2.7-code",
        "reasoning": "high",
        "fallback_models": [
          "litellm/gemini-3.6-flash"
        ]
      },
      "quick": {
        "model": "litellm/deepseek-v4.1-flash",
        "reasoning": "minimal",
        "fallback_models": [
          "litellm/deepseek-v4.1-flash"
        ]
      },
      "unspecified-low": {
        "model": "litellm/deepseek-v4.1-flash",
        "reasoning": "medium",
        "fallback_models": [
          "litellm/muse-spark-1.2-contributor",
          "litellm/glm-5.3-flash"
        ]
      },
      "unspecified-high": {
        "model": "litellm/muse-spark-1.3-contributor",
        "reasoning": "high",
        "fallback_models": [
          "litellm/glm-5.2"
        ]
      },
      "writing": {
        "model": "litellm/deepseek-v4.1-flash",
        "reasoning": "low",
        "fallback_models": [
          "litellm/deepseek-v4.1-flash"
        ]
      },
      "deep": {
        "model": "litellm/muse-spark-1.3-contributor",
        "reasoning": "xhigh",
        "fallback_models": [
          "litellm/deepseek-v4-pro-0813",
          "litellm/glm-5.2",
          "litellm/kimi-5.3-flash"
        ]
      }
    },
    "background_task": {
      "staleTimeoutMs": 90000,
      "messageStalenessTimeoutMs": 600000,
      "taskTtlMs": 1200000,
      "sessionGoneTimeoutMs": 15000
    }
  },
  "_migrations": [
    "2026-07-opencode-config-unification",
    "2026-08-reasoning-unification",
    "2026-09-category-deep-split",
    "2026-09-opencode-routing-notice"
  ]
}
```
