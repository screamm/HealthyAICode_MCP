<?php
function processData($user, $config, $logger, $db, $cache): array {
    $result = [];
    if ($user->isActive()) {
        foreach ($db->getItems() as $item) {
            switch ($item->status) {
                case 'active':
                    if ($item->priority > 10) {
                        while ($cache->isLocked()) {
                            sleep(1);
                        }
                        $logger->log($item->id);
                        $result[] = $item;
                    }
                    break;
                case 'pending':
                    if ($item->createdAt < $config->cutoff) {
                        throw new Exception('Too old');
                    }
                    break;
            }
        }
    }
    return $result;
}
