"""Heavily nested and complex function — unhealthy health score expected."""


def process_data(items, config, options, callback, mode, extra):
    if items:
        for item in items:
            if item > 0:
                while item > 1:
                    if item % 2 == 0:
                        if mode == 'fast':
                            if config.get('turbo'):
                                if options.get('aggressive'):
                                    return 'turbo-fast'
                                return 'fast-config'
                            return 'fast'
                        elif mode == 'slow':
                            if config.get('safe'):
                                return 'slow-safe'
                            return 'slow'
                        elif mode == 'auto':
                            if item > 100:
                                return 'auto-large'
                            return 'auto'
                    item -= 1
            elif item < -10:
                return 'negative'
            elif item == 0:
                return 'zero'
    elif extra:
        if isinstance(extra, dict):
            if 'key' in extra:
                return extra['key']
        return 'extra'
    return 'default'
