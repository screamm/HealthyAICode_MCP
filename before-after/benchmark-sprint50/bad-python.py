# Benchmark file: intentionally bad Python code
# Expected smells: ComplexMethod, DeepNesting, MagicNumber, LargeMethod, LowDocCoverage

def calculate_shipping_cost(weight, destination, priority, account):
    base_rate = 0
    fuel_surcharge = 0
    remote_area_fee = 0
    insurance = 0

    if weight is not None and weight > 0:
        if destination is not None and len(destination) > 0:
            if priority in ['standard', 'express', 'overnight']:
                if account is not None:
                    if account.get('active') == True:
                        if priority == 'standard':
                            if weight <= 0.5:
                                base_rate = 3.99
                            elif weight <= 2.0:
                                base_rate = 5.99
                            elif weight <= 5.0:
                                base_rate = 8.99
                            elif weight <= 10.0:
                                base_rate = 12.99
                            else:
                                base_rate = 12.99 + (weight - 10.0) * 1.25
                        elif priority == 'express':
                            if weight <= 0.5:
                                base_rate = 9.99
                            elif weight <= 2.0:
                                base_rate = 14.99
                            elif weight <= 5.0:
                                base_rate = 21.99
                            else:
                                base_rate = 21.99 + (weight - 5.0) * 2.50
                        elif priority == 'overnight':
                            base_rate = 39.99 + weight * 4.99

                        fuel_surcharge = base_rate * 0.16

                        if destination in ['AK', 'HI', 'PR', 'GU', 'VI']:
                            remote_area_fee = base_rate * 0.25

                        if account.get('insurance_required') == True:
                            if base_rate > 50:
                                insurance = base_rate * 0.03
                            else:
                                insurance = 1.50

                        if account.get('tier') == 'gold':
                            discount = (base_rate + fuel_surcharge) * 0.10
                        elif account.get('tier') == 'silver':
                            discount = (base_rate + fuel_surcharge) * 0.05
                        else:
                            discount = 0

                        total = base_rate + fuel_surcharge + remote_area_fee + insurance - discount
                        return round(total, 2)

    return None


def parse_and_validate_config(config_data, schema, environment):
    errors = []
    warnings = []
    parsed = {}

    if not isinstance(config_data, dict):
        errors.append('Config must be a dictionary')
        return None, errors, warnings

    for key, rules in schema.items():
        if rules.get('required') and key not in config_data:
            errors.append(f'Missing required field: {key}')
        elif key in config_data:
            value = config_data[key]
            expected_type = rules.get('type')

            if expected_type == 'int':
                if not isinstance(value, int):
                    try:
                        value = int(value)
                    except (ValueError, TypeError):
                        errors.append(f'Field {key} must be an integer')
                        continue
                if 'min' in rules and value < rules['min']:
                    errors.append(f'Field {key} must be >= {rules["min"]}')
                if 'max' in rules and value > rules['max']:
                    errors.append(f'Field {key} must be <= {rules["max"]}')

            elif expected_type == 'str':
                if not isinstance(value, str):
                    errors.append(f'Field {key} must be a string')
                    continue
                if 'min_length' in rules and len(value) < rules['min_length']:
                    errors.append(f'Field {key} must be at least {rules["min_length"]} chars')
                if 'max_length' in rules and len(value) > rules['max_length']:
                    errors.append(f'Field {key} must be at most {rules["max_length"]} chars')
                if 'pattern' in rules:
                    import re
                    if not re.match(rules['pattern'], value):
                        errors.append(f'Field {key} does not match required pattern')

            elif expected_type == 'bool':
                if not isinstance(value, bool):
                    if value in ('true', 'True', '1', 1):
                        value = True
                    elif value in ('false', 'False', '0', 0):
                        value = False
                    else:
                        errors.append(f'Field {key} must be a boolean')
                        continue

            elif expected_type == 'list':
                if not isinstance(value, list):
                    errors.append(f'Field {key} must be a list')
                    continue
                if 'items' in rules:
                    allowed = rules['items']
                    for idx, item in enumerate(value):
                        if allowed == 'str' and not isinstance(item, str):
                            errors.append(f'Field {key}[{idx}] must be a string')
                        elif allowed == 'int' and not isinstance(item, int):
                            errors.append(f'Field {key}[{idx}] must be an integer')
                        elif allowed == 'float' and not isinstance(item, (int, float)):
                            errors.append(f'Field {key}[{idx}] must be a number')

            if environment == 'production':
                if key.endswith('_debug') and value:
                    warnings.append(f'Debug flag {key} is enabled in production')
                if key.endswith('_password') or key.endswith('_secret'):
                    if len(str(value)) < 16:
                        warnings.append(f'Secret {key} appears too short for production')

            parsed[key] = value

    return parsed, errors, warnings


def compute_statistics(data_points, include_percentiles, outlier_threshold):
    if not data_points or len(data_points) == 0:
        return {}

    n = len(data_points)
    sorted_data = sorted(data_points)

    total = 0
    for v in data_points:
        total += v
    mean = total / n

    variance_sum = 0
    for v in data_points:
        variance_sum += (v - mean) ** 2
    variance = variance_sum / n
    std_dev = variance ** 0.5

    median = sorted_data[n // 2] if n % 2 == 1 else (sorted_data[n // 2 - 1] + sorted_data[n // 2]) / 2

    outliers = []
    clean_data = []
    for v in data_points:
        if abs(v - mean) > outlier_threshold * std_dev:
            outliers.append(v)
        else:
            clean_data.append(v)

    result = {
        'count': n,
        'mean': round(mean, 4),
        'median': median,
        'std_dev': round(std_dev, 4),
        'min': sorted_data[0],
        'max': sorted_data[-1],
        'range': sorted_data[-1] - sorted_data[0],
        'outliers': outliers,
        'outlier_count': len(outliers),
    }

    if include_percentiles:
        percentiles = [10, 25, 75, 90, 95, 99]
        for p in percentiles:
            idx = int(n * p / 100)
            if idx >= n:
                idx = n - 1
            result[f'p{p}'] = sorted_data[idx]

    if len(clean_data) > 1:
        clean_mean = sum(clean_data) / len(clean_data)
        result['trimmed_mean'] = round(clean_mean, 4)

    return result
