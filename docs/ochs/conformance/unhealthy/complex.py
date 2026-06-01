def process_data(items, config, options, callback, mode, extra):
    if items:
        for item in items:
            if item > 0:
                while item > 1:
                    if item % 2 == 0:
                        if mode == 'fast':
                            return 'fast'
                        elif mode == 'slow':
                            return 'slow'
                    item -= 1
            elif item < -10:
                return 'negative'
    elif extra:
        return 'extra'
    return 'default'
